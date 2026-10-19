/**
 * Pakka Note - Local JSON Audit Store
 * File-backed audit persistence (container-local JSON store).
 *
 * NOTE ON RUNTIME PERSISTENCE:
 * This store persists audit records to container-local storage at `data/pakka_note_audit.json`.
 * In containerized deployments (such as Google Cloud Run or AI Studio container runtimes),
 * local file storage is ephemeral across container instances or rebuilds.
 * For production multi-instance durability, an external database (such as Cloud SQL PostgreSQL
 * or Firestore) would be required.
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

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'pakka_note_audit.json');

class AuditDatabase {
  private data: DatabaseSchema;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
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
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
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
   * Synchronous flush for initial setup
   */
  private flushSync() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[AuditDatabase] Failed to flush database synchronously:', err);
    }
  }

  /**
   * Queued atomic flush to prevent concurrent write corruption
   */
  private scheduleFlush(): void {
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          if (!fs.existsSync(DB_DIR)) {
            await fs.promises.mkdir(DB_DIR, { recursive: true });
          }
          const snapshot = JSON.stringify(this.data, null, 2);
          const tmpFile = `${DB_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await fs.promises.writeFile(tmpFile, snapshot, 'utf-8');
          await fs.promises.rename(tmpFile, DB_FILE);
        } catch (err) {
          console.error('[AuditDatabase] Error persisting data to JSON file:', err);
        }
      })
      .catch((err) => {
        console.error('[AuditDatabase] Critical write queue error:', err);
      });
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
      this.scheduleFlush();
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
      this.scheduleFlush();
    }
  }

  public insertCapture(capture: CaptureRecord): void {
    this.data.captures.push(capture);
    if (this.data.sessions[capture.sessionId]) {
      this.data.sessions[capture.sessionId].capturesCount =
        (this.data.sessions[capture.sessionId].capturesCount || 0) + 1;
    }
    this.scheduleFlush();
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
    this.scheduleFlush();
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
    this.scheduleFlush();
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
    this.scheduleFlush();
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
      engine: 'Local JSON Audit Store (Container-local, Non-relational)',
      storagePath: 'data/pakka_note_audit.json',
      runtimePersistenceDisclosed: true,
      totalSessions: Object.keys(this.data.sessions).length,
      totalCaptures: this.data.captures.length,
      totalEvents: this.data.state_events.length,
      totalBenchmarkRuns: this.data.benchmark_runs.length,
    };
  }
}

export const auditDb = new AuditDatabase();
