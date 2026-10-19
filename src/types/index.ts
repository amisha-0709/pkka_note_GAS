/**
 * Pakka Note - Core Type Definitions
 * Voice-to-structured-data verification framework
 */

export type FieldType = 'mobile_number' | 'pin' | 'service_tag' | 'spelled_name';

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
  status: 'valid_candidate' | 'invalid_candidate' | 'uncertain';
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
  validityStatus: 'valid_candidate' | 'invalid_candidate' | 'uncertain';
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
  persistence: {
    engine: string;
    totalSessions: number;
    totalCaptures: number;
    totalEvents: number;
  };
}

export interface BenchmarkCase {
  caseId: string;
  field: FieldType;
  language: LanguageCode;
  expectedValue: string;
  audioCondition: 'clean' | 'degraded_telephony' | 'simulated_transcript';
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
    | 'spelled_name';
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
  status?: 'pass' | 'fail' | 'rejected_as_expected';
}

export interface BenchmarkRun {
  runId: string;
  timestamp: string;
  isLiveApi: boolean;
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
}
