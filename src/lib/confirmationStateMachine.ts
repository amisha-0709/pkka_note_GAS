/**
 * Pakka Note - Confirmation & Correction State Machine
 * Strictly enforces explicit user confirmation; no auto-confirmation.
 */

import type {
  ConfirmationClassification,
  ConfirmationState,
  FieldType,
  FieldValidationResult,
  StateChangeEvent,
} from '../types/index.ts';
import { validateFieldCandidate } from './fieldEngine.ts';

// Affirmative keywords in English and Hindi
const AFFIRMATIVE_WORDS = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'correct',
  'right',
  'confirm',
  'confirmed',
  'true',
  'pakka',
  'ha',
  'haan',
  'sahi',
  'sahi hai',
  'theek',
  'theek hai',
  'bilkul',
  'barabar',
];

// Negative keywords in English and Hindi
const NEGATIVE_WORDS = [
  'no',
  'nope',
  'nah',
  'wrong',
  'incorrect',
  'reject',
  'rejected',
  'false',
  'nahi',
  'na',
  'galat',
  'galat hai',
  'not right',
  'not correct',
  'change',
  'fix',
];

/**
 * Classifies spoken or written user response into confirm, reject, or unclear
 */
export function classifyConfirmationInput(input: string): ConfirmationClassification {
  if (!input || !input.trim()) {
    return {
      intent: 'unclear',
      confidenceDescription: 'Empty input received. Unable to infer confirmation.',
      rawInput: input,
    };
  }

  const normalized = input.toLowerCase().trim();

  // Explicit check for negations before checking positive matches
  // e.g., "no that's not right", "not correct", "not yes"
  if (
    normalized.includes('not') ||
    normalized.includes('nahi') ||
    normalized.includes('galat') ||
    normalized.includes('wrong') ||
    normalized.includes('incorrect')
  ) {
    return {
      intent: 'reject',
      confidenceDescription: 'Negative utterance or negation detected.',
      detectedWord: 'negation/rejection',
      rawInput: input,
    };
  }

  // Tokenize
  const tokens = normalized.split(/[\s,.-]+/);

  // Check negative match
  for (const neg of NEGATIVE_WORDS) {
    if (tokens.includes(neg) || normalized === neg) {
      return {
        intent: 'reject',
        confidenceDescription: `Explicit rejection detected ("${neg}").`,
        detectedWord: neg,
        rawInput: input,
      };
    }
  }

  // Check affirmative match
  for (const aff of AFFIRMATIVE_WORDS) {
    if (tokens.includes(aff) || normalized === aff) {
      return {
        intent: 'confirm',
        confidenceDescription: `Explicit affirmative confirmation detected ("${aff}").`,
        detectedWord: aff,
        rawInput: input,
      };
    }
  }

  // Ambiguous utterance
  return {
    intent: 'unclear',
    confidenceDescription: `Uncertain or ambiguous utterance ("${input}"). Neither clear yes nor no detected.`,
    rawInput: input,
  };
}

/**
 * Handles partial or full correction logic
 */
export interface CorrectionPayload {
  mode: 'full' | 'replace_last_n' | 'replace_at_index';
  correctionInput: string;
  lastN?: number;
  startIndex?: number;
}

export interface CorrectionResult {
  previousCandidate: string;
  proposedCandidate: string;
  mergedValue: string;
  validation: FieldValidationResult;
  success: boolean;
  message: string;
}

export function applyCorrection(
  previousCandidate: string,
  field: FieldType,
  payload: CorrectionPayload
): CorrectionResult {
  let merged = '';

  if (payload.mode === 'full') {
    merged = payload.correctionInput.trim();
  } else if (payload.mode === 'replace_last_n') {
    const n = Math.max(1, payload.lastN || 1);
    const cleanCorrection = payload.correctionInput.trim();
    if (previousCandidate.length >= n) {
      const base = previousCandidate.substring(0, previousCandidate.length - n);
      merged = base + cleanCorrection;
    } else {
      merged = cleanCorrection;
    }
  } else if (payload.mode === 'replace_at_index') {
    const idx = Math.max(0, payload.startIndex || 0);
    const cleanCorrection = payload.correctionInput.trim();
    const before = previousCandidate.substring(0, idx);
    const after = previousCandidate.substring(idx + cleanCorrection.length);
    merged = before + cleanCorrection + after;
  }

  // Re-run validation on the merged value
  const validation = validateFieldCandidate(field, merged);

  return {
    previousCandidate,
    proposedCandidate: payload.correctionInput,
    mergedValue: validation.normalizedCandidate || merged,
    validation,
    success: validation.valid,
    message: validation.valid
      ? `Corrected value accepted: ${validation.normalizedCandidate}. Please review read-back and confirm.`
      : `Corrected value "${merged}" failed validation: ${validation.validationMessage}`,
  };
}

/**
 * Validates whether a state transition is permitted
 */
export function canTransition(from: ConfirmationState, to: ConfirmationState): boolean {
  const allowedTransitions: Record<ConfirmationState, ConfirmationState[]> = {
    idle: ['captured', 'manual_entry'],
    captured: ['transcribing', 'transcribed', 'failed'],
    transcribing: ['transcribed', 'failed'],
    transcribed: ['valid_candidate', 'invalid_candidate', 'uncertain', 'failed'],
    valid_candidate: ['reading_back', 'read_back', 'correcting', 'manual_entry', 'failed'],
    invalid_candidate: ['correcting', 'captured', 'manual_entry', 'failed'],
    uncertain: ['reading_back', 'read_back', 'correcting', 'captured', 'manual_entry', 'failed'],
    reading_back: ['read_back', 'failed'],
    read_back: ['confirmed', 'rejected', 'uncertain', 'correcting', 'manual_entry'],
    confirmed: ['idle', 'captured'],
    rejected: ['correcting', 'captured', 'manual_entry'],
    correcting: ['corrected', 'failed', 'manual_entry'],
    corrected: ['valid_candidate', 'invalid_candidate', 'reading_back', 'read_back'],
    failed: ['idle', 'captured', 'manual_entry'],
    manual_entry: ['valid_candidate', 'invalid_candidate', 'read_back', 'idle'],
  };

  return allowedTransitions[from]?.includes(to) ?? false;
}

/**
 * Creates an audit state change event object
 */
export function createStateEvent(
  sessionId: string,
  previousState: ConfirmationState,
  newState: ConfirmationState,
  attemptNumber: number,
  captureId?: string,
  finalValueIfConfirmed?: string,
  metadata?: Record<string, unknown>
): StateChangeEvent {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sessionId,
    captureId,
    timestamp: new Date().toISOString(),
    eventType: `STATE_${previousState.toUpperCase()}_TO_${newState.toUpperCase()}`,
    previousState,
    newState,
    finalValueIfConfirmed,
    attemptNumber,
    metadata,
  };
}
