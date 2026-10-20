/**
 * Pakka Note - Local JSON Audit Store
 * File-backed audit persistence (container-local JSON store).
 *
 * NOTE ON RUNTIME PERSISTENCE & ARCHITECTURAL REALITY:
 * This store persists audit records to container-local JSON storage at `data/pakka_note_audit.json`.
 * It is NOT a relational SQL database.
 * In containerized deployments (such as Google Cloud Run or AI Studio preview container environments),
 * local file storage is container-local and ephemeral across redeployments, restarts, or multi-instance scaling.
 * For production multi-instance durability, the simplest supported persistent-storage options are:
 * 1. Google Cloud SQL (PostgreSQL with Drizzle ORM)
 * 2. Google Cloud Firestore (Document store with real-time sync)
 *
 * DURABILITY & OBSERVABILITY:
 * - Mutations are queued serially and written atomically via temporary file rename.
 * - Persistence failures (e.g. disk I/O, permissions, storage quota) are observable via `await auditDb.flush()`.
 *   If persistence fails during confirmation, the operation rejects and rolls back memory state,
 *   preventing false confirmation finalization.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  CaptureRecord,
  ConfirmationState,
  FieldType,
  LanguageCode,
  SessionRecord,
  StateChangeEvent,
  BenchmarkRun,
} from '../../types/index.ts';

interface DatabaseSchema {
  sessions: Record<string, SessionRecord>;
  captures: CaptureRecord[];
  state_events: StateChangeEvent[];
  benchmark_runs: BenchmarkRun[];
}

const DEFAULT_DB_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_DB_FILE = path.join(DEFAULT_DB_DIR, 'pakka_note_audit.json');

export class AuditDatabase {
  private data: DatabaseSchema;
  private writeQueue: Promise<void> = Promise.resolve();
  private storageDir: string;
  private storageFile: string;
  private simulateWriteFailure = false;

  constructor(customFilePath?: string) {
    this.storageFile = customFilePath || DEFAULT_DB_FILE;
    this.storageDir = path.dirname(this.storageFile);
    this.data = {
      sessions: {},
      captures: [],
      state_events: [],
      benchmark_runs: [],
    };
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          sessions: parsed.sessions || {},
          captures: parsed.captures || [],
          state_events: parsed.state_events || [],
          benchmark_runs: parsed.benchmark_runs || [],
        };
      } else {
        this.flushSync();
      }
    } catch (err) {
      console.error('[AuditDatabase] Failed to load DB file, initializing clean state:', err);
      this.flushSync();
    }
  }

  /**
   * Synchronous flush for initial boot
   */
  private flushSync() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const tmpFile = `${this.storageFile}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.storageFile);
    } catch (err) {
      console.error('[AuditDatabase] Failed to flush database synchronously:', err);
    }
  }

  /**
   * Queued atomic flush with observable Promise resolution/rejection.
   */
  public scheduleFlush(): Promise<void> {
    const nextFlush = this.writeQueue.then(async () => {
      if (this.simulateWriteFailure) {
        throw new Error('EIO: Simulated disk write persistence failure');
      }

      if (!fs.existsSync(this.storageDir)) {
        await fs.promises.mkdir(this.storageDir, { recursive: true });
      }

      const snapshot = JSON.stringify(this.data, null, 2);
      const tmpFile = `${this.storageFile}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await fs.promises.writeFile(tmpFile, snapshot, 'utf-8');
      await fs.promises.rename(tmpFile, this.storageFile);
    });

    // Keep writeQueue chain alive regardless of error so subsequent calls don't hang
    this.writeQueue = nextFlush.catch((err) => {
      // Handled by immediate caller awaiting flush()
    });

    // Propagate failure to the immediate caller that requested this flush
    return nextFlush;
  }

  /**
   * Explicitly await persistence of all pending operations to disk
   */
  public async flush(): Promise<void> {
    return this.scheduleFlush();
  }

  /**
   * Rollback memory mutations when disk persistence fails
   */
  public rollbackLastEvent(
    sessionId: string,
    previousStatus?: ConfirmationState,
    previousFinalValue?: string
  ): void {
    this.data.state_events.pop();
    const session = this.data.sessions[sessionId];
    if (session) {
      if (previousStatus) session.status = previousStatus;
      session.finalValue = previousFinalValue;
    }
  }

  /**
   * Test hook: simulate persistence write failure
   */
  public setSimulateWriteFailure(fail: boolean): void {
    this.simulateWriteFailure = fail;
  }

  /**
   * Test hook: reset state for clean test isolation
   */
  public clearForTesting(): void {
    this.data = {
      sessions: {},
      captures: [],
      state_events: [],
      benchmark_runs: [],
    };
    this.flushSync();
  }

  /**
   * Test hook: point to a custom temporary file
   */
  public setTestStoragePath(customFilePath: string): void {
    this.storageFile = customFilePath;
    this.storageDir = path.dirname(customFilePath);
    this.clearForTesting();
  }

  public createOrGetSession(
    sessionId: string,
    field: FieldType,
    language: LanguageCode
  ): SessionRecord {
    if (!this.data.sessions[sessionId]) {
      this.data.sessions[sessionId] = {
        sessionId,
        createdAt: new Date().toISOString(),
        selectedField: field,
        selectedLanguage: language,
        applicationVersion: '1.0.0-challenge2026',
        capturesCount: 0,
        status: 'idle',
      };
      this.scheduleFlush().catch(() => {});
    }
    return this.data.sessions[sessionId];
  }

  public getSession(sessionId: string): SessionRecord | undefined {
    return this.data.sessions[sessionId];
  }

  public updateSessionStatus(
    sessionId: string,
    status: ConfirmationState,
    finalValue?: string
  ): void {
    if (this.data.sessions[sessionId]) {
      this.data.sessions[sessionId].status = status;
      if (finalValue !== undefined) {
        this.data.sessions[sessionId].finalValue = finalValue;
      }
      this.scheduleFlush().catch(() => {});
    }
  }

  public insertCapture(capture: CaptureRecord): void {
    this.data.captures.push(capture);
    if (this.data.sessions[capture.sessionId]) {
      this.data.sessions[capture.sessionId].capturesCount =
        (this.data.sessions[capture.sessionId].capturesCount || 0) + 1;
    }
    this.scheduleFlush().catch(() => {});
  }

  public getCapture(captureId: string): CaptureRecord | undefined {
    return this.data.captures.find((c) => c.captureId === captureId);
  }

  public updateCaptureCandidate(
    captureId: string,
    candidate: string,
    valid: boolean,
    message: string
  ): boolean {
    const capture = this.data.captures.find((c) => c.captureId === captureId);
    if (!capture) return false;

    capture.normalizedCandidate = candidate;
    capture.validityStatus = valid ? 'valid_candidate' : 'invalid_candidate';
    capture.validationMessage = message;
    this.scheduleFlush().catch(() => {});
    return true;
  }

  public insertEvent(event: StateChangeEvent): void {
    this.data.state_events.push(event);
    if (this.data.sessions[event.sessionId]) {
      this.data.sessions[event.sessionId].status = event.newState;
      if (event.finalValueIfConfirmed) {
        this.data.sessions[event.sessionId].finalValue = event.finalValueIfConfirmed;
      }
    }
    this.scheduleFlush().catch(() => {});
  }

  public getEvents(sessionId: string): StateChangeEvent[] {
    return this.data.state_events.filter((e) => e.sessionId === sessionId);
  }

  /**
   * Checks if a successful spoken read-back was recorded for the exact capture
   * and candidate, and that no subsequent rejection or correction has invalidated it.
   */
  public hasSuccessfulReadBack(sessionId: string, captureId: string, candidate?: string): boolean {
    const events = this.data.state_events.filter(
      (e) => e.sessionId === sessionId && e.captureId === captureId
    );

    if (events.length === 0) return false;

    // Filter to read-back execution events (where read-back was performed)
    const readbackAttempts = events.filter((e) => {
      const isReadbackEvent =
        e.newState === 'read_back' ||
        (e.previousState === 'valid_candidate' && e.newState === 'failed') ||
        (e.metadata && typeof e.metadata.spokenText === 'string');
      // Exclude state transitions leaving read_back (e.g. read_back -> rejected, read_back -> confirmed)
      const isExitTransition =
        e.previousState === 'read_back' && e.newState !== 'read_back';
      return isReadbackEvent && !isExitTransition;
    });

    if (readbackAttempts.length === 0) return false;

    // If candidate was specified, find readback attempts specifically for this candidate
    const candidateAttempts = candidate
      ? readbackAttempts.filter((e) => e.metadata?.candidate === candidate)
      : readbackAttempts;

    if (candidateAttempts.length === 0) return false;

    const latest = candidateAttempts[candidateAttempts.length - 1];

    if (latest.newState !== 'read_back') {
      return false;
    }

    if (latest.metadata && (latest.metadata.error || latest.metadata.errorCode)) {
      return false;
    }

    // Verify no subsequent rejection, correction, or failure has invalidated this read-back
    const latestIndex = events.lastIndexOf(latest);
    const subsequent = events.slice(latestIndex + 1);
    const wasInvalidated = subsequent.some(
      (e) => e.newState === 'rejected' || e.newState === 'corrected' || e.newState === 'failed'
    );

    if (wasInvalidated) {
      return false;
    }

    return true;
  }

  public getSessionRecords(sessionId: string): {
    session?: SessionRecord;
    captures: CaptureRecord[];
    events: StateChangeEvent[];
  } {
    const session = this.data.sessions[sessionId];
    const captures = this.data.captures.filter((c) => c.sessionId === sessionId);
    const events = this.data.state_events.filter((e) => e.sessionId === sessionId);
    return { session, captures, events };
  }

  public getAllSessions(): SessionRecord[] {
    return Object.values(this.data.sessions).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public saveBenchmarkRun(run: BenchmarkRun): void {
    this.data.benchmark_runs.push(run);
    this.scheduleFlush().catch(() => {});
  }

  public getBenchmarkRuns(): BenchmarkRun[] {
    return this.data.benchmark_runs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public getBenchmarkRun(runId: string): BenchmarkRun | undefined {
    return this.data.benchmark_runs.find((r) => r.runId === runId);
  }

  public getStats() {
    return {
      engine: 'Local JSON Audit Store (Container-local, Non-relational File Store)',
      storagePath: this.storageFile,
      runtimePersistenceDisclosed: true,
      containerLocalLimitation:
        'Local file storage is container-local and ephemeral across redeployments or container restarts. External persistent storage (Cloud SQL or Firestore) is required for multi-instance production durability.',
      totalSessions: Object.keys(this.data.sessions).length,
      totalCaptures: this.data.captures.length,
      totalEvents: this.data.state_events.length,
      totalBenchmarkRuns: this.data.benchmark_runs.length,
    };
  }
}

export const auditDb = new AuditDatabase();
