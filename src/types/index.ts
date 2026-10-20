/**
 * Pakka Note - Core Type Definitions
 * Voice-to-structured-data verification framework
 */

export type FieldType =
  | 'mobile_number'
  | 'pin'
  | 'service_tag'
  | 'spelled_name'
  | 'name'
  | 'mobile'
  | 'email'
  | 'imei'
  | 'serial'
  | 'order_id'
  | 'postal_pin'
  | 'custom';

export type LanguageCode = 'en-IN' | 'hi-IN';

export type STTFormatMode = 'transcribe' | 'verbatim';

export type ConfirmationState =
  | 'idle'
  | 'captured'
  | 'transcribing'
  | 'transcribed'
  | 'valid_candidate'
  | 'invalid_candidate'
  | 'uncertain'
  | 'needs_review'
  | 'reading_back'
  | 'read_back'
  | 'confirmed'
  | 'rejected'
  | 'correcting'
  | 'corrected'
  | 'failed'
  | 'manual_entry';

export interface FieldProfileDefinition {
  id: FieldType;
  name: string;
  tagline: string;
  description: string;
  formatDescription: string;
  sampleInput: string;
  expectedLength?: number;
  syntheticWarning: string;
}

export interface NormalizationStep {
  step: string;
  before: string;
  after: string;
  description: string;
}

export interface FieldValidationResult {
  field: FieldType;
  rawTranscript: string;
  normalizedCandidate: string;
  valid: boolean;
  status: 'valid_candidate' | 'invalid_candidate' | 'uncertain' | 'needs_review';
  validationMessage: string;
  confidenceOrUncertainty?: string;
  normalizationSteps: NormalizationStep[];
  warnings: string[];
}

export interface ReadBackConfig {
  field: FieldType;
  candidate: string;
  language: LanguageCode;
  model: string;
  voice: string;
}

export interface ReadBackResult {
  captureId: string;
  spokenText: string;
  audioBase64?: string;
  audioMimeType: string;
  latencyMs: number;
  model: string;
  voice: string;
  success: boolean;
  errorMessage?: string;
}

export interface ConfirmationClassification {
  intent: 'confirm' | 'reject' | 'unclear';
  confidenceDescription: string;
  detectedWord?: string;
  rawInput: string;
}

export interface StateChangeEvent {
  eventId: string;
  sessionId: string;
  captureId?: string;
  timestamp: string;
  eventType: string;
  previousState: ConfirmationState;
  newState: ConfirmationState;
  finalValueIfConfirmed?: string;
  attemptNumber: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface CaptureRecord {
  captureId: string;
  sessionId: string;
  attempt: number;
  timestamp: string;
  field: FieldType;
  language: LanguageCode;
  model: string;
  modelVersion: string;
  mode: STTFormatMode;
  audioFormat: string;
  rawTranscript: string;
  normalizedCandidate: string;
  validityStatus: 'valid_candidate' | 'invalid_candidate' | 'uncertain' | 'needs_review';
  validationMessage: string;
  finalValue?: string;
  attempts: number;
  latencyMs: number;
  errorCategory?: string;
  audioDurationSeconds?: number;
}

export interface SessionRecord {
  sessionId: string;
  createdAt: string;
  selectedField: FieldType;
  selectedLanguage: LanguageCode;
  applicationVersion: string;
  capturesCount: number;
  finalValue?: string;
  status: ConfirmationState;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  gnaniConfig: {
    sttConfigured: boolean;
    ttsConfigured: boolean;
    sttEndpoint: string;
    ttsEndpoint: string;
    maskedApiKey: string;
    sttModel: string;
    ttsModel: string;
    ttsVoice: string;
  };
  geminiConfig?: {
    configured: boolean;
    model: string;
    lastLatencyMs?: number;
  };
  persistence: {
    engine: string;
    totalSessions: number;
    totalCaptures: number;
    totalEvents: number;
    totalCalls?: number;
    totalCandidates?: number;
  };
}

export type BenchmarkEvaluationMode =
  | 'simulated_transcript_regression'
  | 'provider_connectivity_smoke_test'
  | 'live_synthetic_speech_benchmark';

export interface BenchmarkCase {
  caseId: string;
  field: FieldType;
  language: LanguageCode;
  expectedValue: string;
  audioCondition: 'clean' | 'degraded_telephony' | 'simulated_transcript' | 'synthetic_tone' | 'synthetic_speech_clip';
  category:
    | 'valid_mobile'
    | 'eight_digit_mobile'
    | 'eleven_digit_mobile'
    | 'yes_confirmation'
    | 'no_confirmation'
    | 'unclear_confirmation'
    | 'correction_case'
    | 'silence_case'
    | 'service_tag_nato'
    | 'spelled_name'
    | 'tone_connectivity_smoke';
  notes: string;
  // Execution results
  b0_verbatim?: string;
  b1_transcribe?: string;
  b2_fieldEngine?: string;
  b3_corrected?: string;
  exactMatchB0?: boolean;
  exactMatchB1?: boolean;
  exactMatchB2?: boolean;
  exactMatchB3?: boolean;
  validFormatB2?: boolean;
  latencyMs?: number;
  status?: 'pass' | 'fail' | 'rejected_as_expected' | 'smoke_ok' | 'smoke_failed' | 'prerequisite_missing';
  b0_error?: string;
  b1_error?: string;
}

export interface BenchmarkRun {
  runId: string;
  timestamp: string;
  isLiveApi: boolean;
  evaluationMode: BenchmarkEvaluationMode;
  sampleCount: number;
  exactMatchB0Rate: number;
  exactMatchB1Rate: number;
  exactMatchB2Rate: number;
  exactMatchB3Rate: number;
  invalidFormatRejectionRate: number;
  falseAcceptanceRate: number;
  correctionSuccessRate: number;
  avgCaptureLatencyMs: number;
  cases: BenchmarkCase[];
  notes?: string;
  prerequisites?: string[];
}

// -------------------------------------------------------------
// Yani Call Spectator Data Models (Section 8)
// -------------------------------------------------------------

export type Speaker = 'agent' | 'customer' | 'unknown';

export type EntityType =
  | 'name'
  | 'mobile'
  | 'email'
  | 'imei'
  | 'serial'
  | 'order_id'
  | 'postal_pin'
  | 'custom';

export type CandidateStatus =
  | 'detected'
  | 'needs_review'
  | 'confirmed'
  | 'edited'
  | 'dismissed'
  | 'superseded';

export interface Call {
  id: string;
  startedAt: string;
  endedAt?: string;
  mode: 'live' | 'simulated' | 'upload';
  state: 'idle' | 'listening' | 'paused' | 'ended' | 'reviewed';
  language: 'en-IN' | 'hi-IN' | 'mixed';
  consentShown: boolean;
  templateId?: string;
}

export interface Segment {
  id: string;
  callId: string;
  speaker: Speaker;
  speakerInferred: boolean;
  startMs: number;
  endMs: number;
  text: string;
  verbatimText?: string;
  final: boolean;
  sttLatencyMs: number;
}

export interface CandidateValidation {
  passed: boolean;
  checks: string[];
  warnings: string[];
}

export interface CandidateEvidence {
  segmentId: string;
  quote: string;
  speaker: Speaker;
  atMs: number;
}

export interface Candidate {
  id: string;
  callId: string;
  type: EntityType;
  value: string;
  displayValue: string; // displayValue may be masked
  status: CandidateStatus;
  confidence: number; // 0..1
  validation: CandidateValidation;
  evidence: CandidateEvidence;
  supersedes?: string;
  customerVerbalConfirm?: boolean;
  alternativeType?: EntityType;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: 'agent';
}

export interface CallNotesDetail {
  candidateId: string;
  label: string;
  value: string;
}

export interface CallNotes {
  callId: string;
  version: number;
  final: boolean;
  summary: string;
  issue: string;
  details: CallNotesDetail[];
  actions: string[];
  followUps: string[];
  openItems: string[];
  generatedAt: string;
  model: string;
}

export interface AuditEvent {
  id: string;
  callId: string;
  type: string;
  at: string;
  meta: Record<string, unknown>;
}

export interface CallTemplate {
  id: string;
  name: string;
  description: string;
  requiredEntities: EntityType[];
  orderIdPattern?: string;
}

export interface SensitiveDataMatch {
  type: 'card_luhn' | 'aadhaar' | 'pan' | 'otp' | 'banking_pin';
  label: string;
  maskedSnippet: string;
  rawStartIndex: number;
  rawEndIndex: number;
}

export interface IYaniStorage {
  createCall(call: Call): Promise<Call>;
  getCall(id: string): Promise<Call | undefined>;
  updateCall(id: string, updates: Partial<Call>): Promise<Call | undefined>;
  listCalls(): Promise<Call[]>;
  deleteCall(id: string): Promise<boolean>;
  purgeAll(): Promise<void>;

  addSegment(segment: Segment): Promise<Segment>;
  getSegments(callId: string): Promise<Segment[]>;

  addCandidate(candidate: Candidate): Promise<Candidate>;
  updateCandidate(id: string, updates: Partial<Candidate>): Promise<Candidate | undefined>;
  getCandidates(callId: string): Promise<Candidate[]>;
  getCandidate(id: string): Promise<Candidate | undefined>;

  saveNotes(notes: CallNotes): Promise<CallNotes>;
  getNotes(callId: string): Promise<CallNotes | undefined>;

  logEvent(event: AuditEvent): Promise<AuditEvent>;
  getAuditEvents(callId: string): Promise<AuditEvent[]>;
}


