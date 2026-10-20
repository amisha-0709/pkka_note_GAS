/**
 * Pakka Note: Yani Call Spectator - Candidate Lifecycle Machine
 *
 * NON-NEGOTIABLE SPECIFICATION:
 * 1. Speech recognition proposes, a human confirms.
 * 2. Never auto-confirm. Candidates start in 'detected' or 'needs_review'.
 * 3. Customer verbal confirmation heard on the call ('yes', 'correct', 'sahi hai')
 *    sets a soft `customerVerbalConfirm: true` tag only. It does NOT finalize the candidate.
 * 4. Mid-call corrections ('no, 4 not 5', 'sorry last digit is 7') create a new Candidate
 *    that supersedes the old one, keeping full history intact.
 */

import type { Candidate, CandidateStatus, EntityType, Speaker } from '../types/index.ts';
import { validateFieldCandidate, formatReadBackLine, scanSensitiveData } from './fieldEngine.ts';

export interface AgentActionPayload {
  action: 'confirm' | 'edit' | 'dismiss';
  value?: string;
  agentId?: string;
}

export interface CandidateTransitionResult {
  candidate: Candidate;
  previousStatus: CandidateStatus;
  revalidationPassed?: boolean;
}

/**
 * Creates a new Candidate record from an extraction
 */
export function createCandidate(params: {
  callId: string;
  type: EntityType;
  value: string;
  displayValue?: string;
  confidence: number;
  segmentId: string;
  quote: string;
  speaker: Speaker;
  atMs: number;
  alternativeType?: EntityType;
  customerVerbalConfirm?: boolean;
  orderPattern?: string;
}): Candidate {
  const { sanitizedText, detections } = scanSensitiveData(params.value);

  // If sensitive data was detected in value, mask it immediately
  const safeValue = detections.length > 0 ? sanitizedText : params.value;
  const safeDisplay = detections.length > 0 ? sanitizedText : (params.displayValue || safeValue);

  // Run deterministic validation
  const validationResult = validateFieldCandidate(params.type, safeValue);

  // Operational warnings (e.g. character ambiguity, syntax flags) versus general synthetic disclaimers
  const operationalWarnings = validationResult.warnings.filter(
    (w) =>
      !w.toLowerCase().includes('synthetic') &&
      !w.toLowerCase().includes('format validity does not prove')
  );

  let initialStatus: CandidateStatus = 'detected';
  if (!validationResult.valid || operationalWarnings.length > 0 || params.type === 'email' || params.confidence < 0.7) {
    initialStatus = 'needs_review';
  }

  return {
    id: `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    callId: params.callId,
    type: params.type,
    value: validationResult.normalizedCandidate || safeValue,
    displayValue: safeDisplay,
    status: initialStatus,
    confidence: Math.max(0, Math.min(1, params.confidence)),
    validation: {
      passed: validationResult.valid,
      checks: validationResult.normalizationSteps.map((s) => s.step),
      warnings: validationResult.warnings,
    },
    evidence: {
      segmentId: params.segmentId,
      quote: params.quote,
      speaker: params.speaker,
      atMs: params.atMs,
    },
    alternativeType: params.alternativeType,
    customerVerbalConfirm: params.customerVerbalConfirm || false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Applies an explicit agent action to a candidate
 * Actions: 'confirm', 'edit' (with new value and re-validation), 'dismiss'
 */
export function applyAgentAction(
  candidate: Candidate,
  actionPayload: AgentActionPayload
): CandidateTransitionResult {
  const previousStatus = candidate.status;
  const updated: Candidate = { ...candidate };

  if (actionPayload.action === 'confirm') {
    updated.status = 'confirmed';
    updated.resolvedAt = new Date().toISOString();
    updated.resolvedBy = 'agent';
    return {
      candidate: updated,
      previousStatus,
    };
  }

  if (actionPayload.action === 'dismiss') {
    updated.status = 'dismissed';
    updated.resolvedAt = new Date().toISOString();
    updated.resolvedBy = 'agent';
    return {
      candidate: updated,
      previousStatus,
    };
  }

  if (actionPayload.action === 'edit') {
    const newValue = actionPayload.value !== undefined ? actionPayload.value.trim() : updated.value;
    const reval = validateFieldCandidate(updated.type, newValue);

    updated.value = reval.normalizedCandidate || newValue;
    updated.displayValue = updated.value;
    updated.status = 'edited';
    updated.resolvedAt = new Date().toISOString();
    updated.resolvedBy = 'agent';
    updated.validation = {
      passed: reval.valid,
      checks: [...updated.validation.checks, 'agent_manual_edit', ...reval.normalizationSteps.map((s) => s.step)],
      warnings: reval.warnings,
    };

    return {
      candidate: updated,
      previousStatus,
      revalidationPassed: reval.valid,
    };
  }

  return { candidate, previousStatus };
}

/**
 * Detects whether customer verbal confirmation occurred in a transcript segment
 * Returns true if customer said affirmative words in response to an agent's read-back.
 */
const VERBAL_AFFIRMATIVES = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'correct',
  'right',
  'that is right',
  'that is correct',
  "that's right",
  "that's correct",
  'pakka',
  'sahi hai',
  'haan',
  'ha',
  'theek hai',
  'bilkul',
  'exactly',
];

export function detectCustomerVerbalConfirm(text: string): boolean {
  if (!text || !text.trim()) return false;
  const lower = text.toLowerCase().trim();

  // Avoid negations like "not right", "no", "nahi"
  if (lower.includes('not') || lower.includes('no') || lower.includes('nahi') || lower.includes('wrong')) {
    return false;
  }

  return VERBAL_AFFIRMATIVES.some((w) => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower);
  });
}

/**
 * Spoken Correction Parser:
 * Detects patterns such as:
 * - "no, it is 4 not 5"
 * - "sorry, last digit is 7"
 * - "let me repeat, 9876..."
 * - "not 5, it's 4"
 * - "wait, the pin is 560001 not 560002"
 */
export interface SpokenCorrectionInfo {
  detected: boolean;
  correctionTranscript: string;
  replacementTarget?: string;
  replacementValue?: string;
  mode: 'replace_digit' | 'replace_last_digit' | 'full_repeat' | 'generic';
}

export function detectSpokenCorrection(transcript: string): SpokenCorrectionInfo {
  const text = transcript.toLowerCase();

  // "last digit is 7" / "sorry last digit is 7"
  const lastDigitMatch = text.match(/(?:sorry|no)?\s*(?:the\s*)?last\s*digit\s*(?:is\s*)?([a-z0-9]+)/i);
  if (lastDigitMatch && lastDigitMatch[1]) {
    return {
      detected: true,
      correctionTranscript: transcript,
      replacementValue: lastDigitMatch[1],
      mode: 'replace_last_digit',
    };
  }

  // "no, it is 4 not 5" / "no it's 4 not 5"
  const notMatch = text.match(/(?:no|sorry|wait)?\s*(?:it\s*is|it's|make\s*it)?\s*([a-z0-9]+)\s+not\s+([a-z0-9]+)/i);
  if (notMatch && notMatch[1] && notMatch[2]) {
    return {
      detected: true,
      correctionTranscript: transcript,
      replacementValue: notMatch[1],
      replacementTarget: notMatch[2],
      mode: 'replace_digit',
    };
  }

  // "not 5, it's 4"
  const notFirstMatch = text.match(/not\s+([a-z0-9]+)[,\s]+(?:it\s*is|it's)?\s*([a-z0-9]+)/i);
  if (notFirstMatch && notFirstMatch[1] && notFirstMatch[2]) {
    return {
      detected: true,
      correctionTranscript: transcript,
      replacementTarget: notFirstMatch[1],
      replacementValue: notFirstMatch[2],
      mode: 'replace_digit',
    };
  }

  // "let me repeat" / "wait let me repeat"
  if (text.includes('let me repeat') || text.includes('sorry let me say again') || text.includes('i meant')) {
    return {
      detected: true,
      correctionTranscript: transcript,
      mode: 'full_repeat',
    };
  }

  return {
    detected: false,
    correctionTranscript: transcript,
    mode: 'generic',
  };
}

/**
 * Applies a spoken correction to an existing active Candidate:
 * Marks the existing candidate as 'superseded' and returns a new active Candidate
 * linked via `supersedes: existingCandidate.id`.
 */
export function applySpokenCorrection(params: {
  existingCandidate: Candidate;
  correctionTranscript: string;
  segmentId: string;
  speaker: Speaker;
  atMs: number;
}): { supersededCandidate: Candidate; newCandidate: Candidate } {
  const { existingCandidate, correctionTranscript, segmentId, speaker, atMs } = params;
  const correction = detectSpokenCorrection(correctionTranscript);

  let updatedValue = existingCandidate.value;

  if (correction.mode === 'replace_last_digit' && correction.replacementValue) {
    // If last digit is specified
    const reval = validateFieldCandidate(existingCandidate.type, correction.replacementValue);
    const newDigit = reval.normalizedCandidate.replace(/\D/g, '').slice(-1) || correction.replacementValue.slice(-1);
    if (updatedValue.length > 0) {
      updatedValue = updatedValue.slice(0, -1) + newDigit;
    }
  } else if (correction.mode === 'replace_digit' && correction.replacementValue && correction.replacementTarget) {
    const valCandidate = validateFieldCandidate(existingCandidate.type, correction.replacementValue);
    const targetCandidate = validateFieldCandidate(existingCandidate.type, correction.replacementTarget);
    const replDigit = valCandidate.normalizedCandidate || correction.replacementValue;
    const tgtDigit = targetCandidate.normalizedCandidate || correction.replacementTarget;

    const idx = updatedValue.lastIndexOf(tgtDigit);
    if (idx !== -1) {
      updatedValue = updatedValue.substring(0, idx) + replDigit + updatedValue.substring(idx + tgtDigit.length);
    }
  } else {
    // Full repeat or generic correction in transcript
    const reval = validateFieldCandidate(existingCandidate.type, correctionTranscript);
    if (reval.valid && reval.normalizedCandidate) {
      updatedValue = reval.normalizedCandidate;
    }
  }

  // Validate the resulting merged/updated value
  const valResult = validateFieldCandidate(existingCandidate.type, updatedValue);

  // 1. Mark existing candidate as superseded
  const supersededCandidate: Candidate = {
    ...existingCandidate,
    status: 'superseded',
    resolvedAt: new Date().toISOString(),
  };

  // 2. Spawn new candidate superseding the earlier one
  const newCandidate: Candidate = {
    id: `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    callId: existingCandidate.callId,
    type: existingCandidate.type,
    value: valResult.normalizedCandidate || updatedValue,
    displayValue: valResult.normalizedCandidate || updatedValue,
    status: valResult.valid ? 'detected' : 'needs_review',
    confidence: Math.max(0.7, existingCandidate.confidence),
    validation: {
      passed: valResult.valid,
      checks: [
        'spoken_correction_applied',
        `superseded_${existingCandidate.id}`,
        ...valResult.normalizationSteps.map((s) => s.step),
      ],
      warnings: valResult.warnings,
    },
    evidence: {
      segmentId,
      quote: correctionTranscript,
      speaker,
      atMs,
    },
    supersedes: existingCandidate.id,
    customerVerbalConfirm: false,
    createdAt: new Date().toISOString(),
  };

  return { supersededCandidate, newCandidate };
}
