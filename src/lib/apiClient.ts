/**
 * Pakka Note - Frontend API Client
 * Clean typed interface with safe JSON parsing and non-JSON error shields.
 */

import type {
  FieldType,
  LanguageCode,
  STTFormatMode,
  SystemHealth,
  SessionRecord,
  CaptureRecord,
  StateChangeEvent,
  BenchmarkRun,
  ReadBackResult,
} from '../types/index.ts';

async function safeFetchJson<T>(
  url: string,
  options?: RequestInit,
  fallbackError?: string
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const rawText = await res.text();
    const cleanSnippet = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const msg = cleanSnippet || fallbackError || `Server returned non-JSON response (HTTP ${res.status})`;
    return {
      ok: false,
      status: res.status,
      data: {
        success: false,
        message: msg,
        errorCode: `HTTP_${res.status}`,
      } as unknown as T,
    };
  }

  try {
    const json = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data: json,
    };
  } catch (err) {
    return {
      ok: false,
      status: res.status,
      data: {
        success: false,
        message: err instanceof Error ? err.message : 'Invalid JSON response from server',
        errorCode: 'JSON_PARSE_ERROR',
      } as unknown as T,
    };
  }
}

export async function fetchHealth(): Promise<SystemHealth> {
  const { ok, data } = await safeFetchJson<SystemHealth>('/api/health');
  if (!ok) {
    throw new Error('Health check endpoint is not responding with valid data.');
  }
  return data;
}

export interface CaptureAudioParams {
  audioBlob?: Blob;
  field: FieldType;
  language: LanguageCode;
  format: STTFormatMode;
  sessionId: string;
  attempt: number;
  isSimulatedFixture?: boolean;
  simulatedTranscript?: string;
}

export interface CaptureResponse {
  success: boolean;
  sessionId: string;
  captureId: string;
  attempt: number;
  rawTranscript: string;
  normalizedCandidate: string;
  valid: boolean;
  status: 'valid_candidate' | 'invalid_candidate' | 'uncertain';
  validationMessage: string;
  normalizationSteps: Array<{
    step: string;
    before: string;
    after: string;
    description: string;
  }>;
  warnings: string[];
  latencyMs: number;
  model: string;
  mode: string;
  errorCode?: string;
  message?: string;
}

import { getAudioFileExtension } from './audioUtils.ts';

export async function captureAudio(params: CaptureAudioParams): Promise<CaptureResponse> {
  const formData = new FormData();
  if (params.audioBlob) {
    const ext = getAudioFileExtension(params.audioBlob.type || 'audio/wav');
    formData.append('audio', params.audioBlob, `capture.${ext}`);
  }
  formData.append('field', params.field);
  formData.append('language', params.language);
  formData.append('format', params.format);
  formData.append('sessionId', params.sessionId);
  formData.append('attempt', String(params.attempt));

  if (params.isSimulatedFixture) {
    formData.append('isSimulatedFixture', 'true');
    if (params.simulatedTranscript) {
      formData.append('simulatedTranscript', params.simulatedTranscript);
    }
  }

  const { data } = await safeFetchJson<CaptureResponse>(
    '/api/capture',
    {
      method: 'POST',
      body: formData,
    },
    'Speech-to-text service unavailable'
  );

  return data;
}

export async function requestReadBack(params: {
  candidate: string;
  field: FieldType;
  language: LanguageCode;
  sessionId: string;
  captureId: string;
  attempt?: number;
}): Promise<ReadBackResult> {
  const { data } = await safeFetchJson<
    ReadBackResult & { errorCode?: string; message?: string }
  >(
    '/api/readback',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    'Text-to-speech service unavailable'
  );

  if (!data.success) {
    return {
      captureId: params.captureId,
      spokenText: data.spokenText || `The captured value is ${params.candidate}. Please confirm.`,
      audioMimeType: 'audio/wav',
      latencyMs: data.latencyMs || 0,
      model: data.model || 'Gnani Timbre',
      voice: data.voice || 'Nalini',
      success: false,
      errorMessage: data.message || 'Read-back synthesis was unsuccessful.',
    };
  }

  return {
    captureId: params.captureId,
    spokenText: data.spokenText,
    audioBase64: data.audioBase64,
    audioMimeType: data.audioMimeType || 'audio/wav',
    latencyMs: data.latencyMs,
    model: data.model || 'Gnani Timbre',
    voice: data.voice || 'Nalini',
    success: true,
  };
}

export async function submitConfirmation(params: {
  sessionId: string;
  captureId: string;
  candidate: string;
  action: 'confirm' | 'reject' | 'voice_input';
  spokenText?: string;
  attempt?: number;
}) {
  const { data } = await safeFetchJson<{
    success: boolean;
    confirmed: boolean;
    newState: string;
    finalValue?: string;
    message: string;
    classificationDetail?: string;
  }>('/api/confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return data;
}

export async function submitCorrection(params: {
  sessionId: string;
  captureId: string;
  field: FieldType;
  previousCandidate: string;
  mode: 'full' | 'replace_last_n' | 'replace_at_index';
  correctionInput: string;
  lastN?: number;
  startIndex?: number;
  attempt?: number;
}) {
  const { data } = await safeFetchJson<{
    success: boolean;
    previousCandidate: string;
    proposedCandidate: string;
    mergedCandidate: string;
    valid: boolean;
    validationMessage: string;
    normalizationSteps: Array<{
      step: string;
      before: string;
      after: string;
      description: string;
    }>;
    warnings: string[];
    status: string;
  }>('/api/correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return data;
}

export async function fetchSessionRecords(sessionId: string): Promise<{
  session?: SessionRecord;
  captures: CaptureRecord[];
  events: StateChangeEvent[];
}> {
  const { ok, data } = await safeFetchJson<{
    session?: SessionRecord;
    captures: CaptureRecord[];
    events: StateChangeEvent[];
  }>(`/api/records?session_id=${encodeURIComponent(sessionId)}`);
  if (!ok) throw new Error(`Failed to load session records for ${sessionId}`);
  return data;
}

export async function fetchAllSessions(): Promise<SessionRecord[]> {
  const { ok, data } = await safeFetchJson<{ sessions: SessionRecord[] }>('/api/sessions');
  if (!ok || !data.sessions) return [];
  return data.sessions;
}

export async function runBenchmark(isLiveApi = false): Promise<BenchmarkRun> {
  const { ok, data } = await safeFetchJson<{ benchmarkRun: BenchmarkRun }>('/api/benchmark/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isLiveApi }),
  });
  if (!ok || !data.benchmarkRun) throw new Error('Benchmark execution failed.');
  return data.benchmarkRun;
}

export async function fetchBenchmarkRuns(): Promise<BenchmarkRun[]> {
  const { ok, data } = await safeFetchJson<{ runs: BenchmarkRun[] }>('/api/benchmark/results');
  if (!ok || !data.runs) return [];
  return data.runs;
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
  model?: string;
  voice?: string;
  errorCode?: string;
}> {
  const { data } = await safeFetchJson<{
    success: boolean;
    message: string;
    latencyMs?: number;
    model?: string;
    voice?: string;
    errorCode?: string;
  }>('/api/test-connection', { method: 'POST' });
  return data;
}
