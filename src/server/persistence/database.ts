/**
 * Pakka Note - Persistent Audit Store
 * File-backed relational audit database with atomic transactional updates.
 * Preserves the exact relational schema: sessions, captures, state_events, benchmarks.
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
        this.flush();
      }
    } catch (err) {
      console.error('[AuditDatabase] Failed to load DB file, initializing clean state:', err);
      this.flush();
    }
  }

  private flush() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[AuditDatabase] Failed to flush database:', err);
    }
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
      this.flush();
    }
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
      this.flush();
    }
  }

  public insertCapture(capture: CaptureRecord): void {
    this.data.captures.push(capture);
    if (this.data.sessions[capture.sessionId]) {
      this.data.sessions[capture.sessionId].capturesCount =
        (this.data.sessions[capture.sessionId].capturesCount || 0) + 1;
    }
    this.flush();
  }

  public insertEvent(event: StateChangeEvent): void {
    this.data.state_events.push(event);
    if (this.data.sessions[event.sessionId]) {
      this.data.sessions[event.sessionId].status = event.newState;
      if (event.finalValueIfConfirmed) {
        this.data.sessions[event.sessionId].finalValue = event.finalValueIfConfirmed;
      }
    }
    this.flush();
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
    this.flush();
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
      engine: 'File-backed Relational Store (data/pakka_note_audit.json)',
      totalSessions: Object.keys(this.data.sessions).length,
      totalCaptures: this.data.captures.length,
      totalEvents: this.data.state_events.length,
      totalBenchmarkRuns: this.data.benchmark_runs.length,
    };
  }
}

export const auditDb = new AuditDatabase();
