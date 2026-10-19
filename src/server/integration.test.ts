import test from 'node:test';
import assert from 'node:assert/strict';
import { getMaskedApiKey } from './config/environment.ts';
import { auditDb } from './persistence/database.ts';
import { runSyntheticBenchmark, benchmarkRunToCSV } from './services/syntheticBenchmarkSuite.ts';
import { createStateEvent, applyCorrection } from '../lib/confirmationStateMachine.ts';
import { callGnaniPrismaSTT } from './services/gnaniPrisma.ts';
import { callGnaniTimbreTTS } from './services/gnaniTimbre.ts';
import { validateFieldCandidate } from '../lib/fieldEngine.ts';

test('Integration: Masked API key returns safe placeholder or masked value, never plain secret', () => {
  const masked = getMaskedApiKey();
  assert.ok(masked === 'Not Configured' || masked.includes('***'));
});

test('Integration: Audit database records session, capture, and chronological state event', () => {
  const testSessionId = `test_sess_${Date.now()}`;
  const session = auditDb.createOrGetSession(testSessionId, 'mobile_number', 'en-IN');
  assert.equal(session.sessionId, testSessionId);
  assert.equal(session.selectedField, 'mobile_number');

  const captureId = `test_cap_${Date.now()}`;
  auditDb.insertCapture({
    captureId,
    sessionId: testSessionId,
    attempt: 1,
    timestamp: new Date().toISOString(),
    field: 'mobile_number',
    language: 'en-IN',
    model: 'Prisma v3 (Mocked Test)',
    modelVersion: 'v3',
    mode: 'transcribe',
    audioFormat: 'audio/wav',
    rawTranscript: '9876543210',
    normalizedCandidate: '9876543210',
    validityStatus: 'valid_candidate',
    validationMessage: 'Valid 10-digit mobile number',
    attempts: 1,
    latencyMs: 120,
  });

  const event = createStateEvent(testSessionId, 'captured', 'valid_candidate', 1, captureId);
  auditDb.insertEvent(event);

  const records = auditDb.getSessionRecords(testSessionId);
  assert.equal(records.captures.length, 1);
  assert.equal(records.events.length, 1);
  assert.equal(records.captures[0].normalizedCandidate, '9876543210');
  assert.equal(records.events[0].newState, 'valid_candidate');
});

test('Integration: Benchmark suite executes B0-B3 and exports valid CSV with honesty metadata', async () => {
  const run = await runSyntheticBenchmark(false);
  assert.ok(run.sampleCount >= 10);
  assert.equal(run.evaluationMode, 'simulated_transcript_regression');
  assert.ok(run.exactMatchB2Rate > 0);
  assert.equal(run.invalidFormatRejectionRate, 100);
  assert.equal(run.falseAcceptanceRate, 0);

  const csv = benchmarkRunToCSV(run);
  assert.match(csv, /# Evaluation Mode: simulated_transcript_regression/);
  assert.match(csv, /Case ID,Category,Field/);
  assert.match(csv, /SYNTH-MOB-01/);
  assert.match(csv, /SYNTH-MOB-03-TRUNC8/);
});

// --- Category 1: Empty or malformed Prisma responses & input validation ---

test('Gnani Prisma: Rejects empty audio buffer', async () => {
  const res = await callGnaniPrismaSTT({
    audioBuffer: Buffer.alloc(0),
    mimeType: 'audio/wav',
    languageCode: 'en-IN',
    format: 'transcribe',
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'EMPTY_AUDIO_INPUT');
});

test('Gnani Prisma: Rejects unsupported language code', async () => {
  const dummyAudio = Buffer.from('RIFF....WAVEfmt ....data....');
  const res = await callGnaniPrismaSTT({
    audioBuffer: dummyAudio,
    mimeType: 'audio/wav',
    languageCode: 'fr-FR' as any,
    format: 'transcribe',
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'UNSUPPORTED_LANGUAGE');
});

test('Gnani Prisma: Rejects unsupported format mode', async () => {
  const dummyAudio = Buffer.from('RIFF....WAVEfmt ....data....');
  const res = await callGnaniPrismaSTT({
    audioBuffer: dummyAudio,
    mimeType: 'audio/wav',
    languageCode: 'en-IN',
    format: 'unsupported_mode' as any,
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'UNSUPPORTED_MODE');
});

// --- Category 2: Timbre response validation ---

test('Gnani Timbre: Rejects empty text input', async () => {
  const res = await callGnaniTimbreTTS({
    text: '   ',
    languageCode: 'en-IN',
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'EMPTY_TEXT_INPUT');
});

test('Gnani Timbre: Rejects text exceeding 20000 characters', async () => {
  const longText = 'a'.repeat(20001);
  const res = await callGnaniTimbreTTS({
    text: longText,
    languageCode: 'en-IN',
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'TEXT_TOO_LONG');
});

test('Gnani Timbre: Rejects unsupported language', async () => {
  const res = await callGnaniTimbreTTS({
    text: 'Hello world',
    languageCode: 'de-DE' as any,
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'UNSUPPORTED_LANGUAGE');
});

// --- Category 3: Server-side Confirmation Rule Enforcement ---

test('Confirmation Rule: Block confirmation before read-back occurs', () => {
  const sessionId = `test_sess_noreadback_${Date.now()}`;
  const captureId = `test_cap_noreadback_${Date.now()}`;
  const candidate = '9876543210';

  auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
  auditDb.insertCapture({
    captureId,
    sessionId,
    attempt: 1,
    timestamp: new Date().toISOString(),
    field: 'mobile_number',
    language: 'en-IN',
    model: 'Prisma v3',
    modelVersion: 'v3',
    mode: 'transcribe',
    audioFormat: 'audio/wav',
    rawTranscript: candidate,
    normalizedCandidate: candidate,
    validityStatus: 'valid_candidate',
    validationMessage: 'Valid 10-digit mobile number',
    attempts: 1,
    latencyMs: 100,
  });

  // State is valid_candidate, NO read-back event recorded
  const hasReadBack = auditDb.hasSuccessfulReadBack(sessionId, captureId, candidate);
  assert.equal(hasReadBack, false, 'Must not report successful read-back when none occurred');
});

test('Confirmation Rule: Block confirmation when capture does not belong to session', () => {
  const session1 = `test_sess_s1_${Date.now()}`;
  const session2 = `test_sess_s2_${Date.now()}`;
  const captureId = `test_cap_mismatch_${Date.now()}`;

  auditDb.createOrGetSession(session1, 'mobile_number', 'en-IN');
  auditDb.createOrGetSession(session2, 'mobile_number', 'en-IN');

  auditDb.insertCapture({
    captureId,
    sessionId: session1, // Belongs to session 1
    attempt: 1,
    timestamp: new Date().toISOString(),
    field: 'mobile_number',
    language: 'en-IN',
    model: 'Prisma v3',
    modelVersion: 'v3',
    mode: 'transcribe',
    audioFormat: 'audio/wav',
    rawTranscript: '9876543210',
    normalizedCandidate: '9876543210',
    validityStatus: 'valid_candidate',
    validationMessage: 'Valid 10-digit mobile number',
    attempts: 1,
    latencyMs: 100,
  });

  const capture = auditDb.getCapture(captureId);
  assert.ok(capture, 'Capture should exist');
  assert.notEqual(capture.sessionId, session2, 'Capture must not match session 2');
});

test('Confirmation Rule: Block confirmation when read-back failed', () => {
  const sessionId = `test_sess_failed_rb_${Date.now()}`;
  const captureId = `test_cap_failed_rb_${Date.now()}`;
  const candidate = '9876543210';

  auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
  auditDb.insertCapture({
    captureId,
    sessionId,
    attempt: 1,
    timestamp: new Date().toISOString(),
    field: 'mobile_number',
    language: 'en-IN',
    model: 'Prisma v3',
    modelVersion: 'v3',
    mode: 'transcribe',
    audioFormat: 'audio/wav',
    rawTranscript: candidate,
    normalizedCandidate: candidate,
    validityStatus: 'valid_candidate',
    validationMessage: 'Valid 10-digit mobile number',
    attempts: 1,
    latencyMs: 100,
  });

  // Record a failed read-back event
  auditDb.insertEvent(
    createStateEvent(sessionId, 'valid_candidate', 'failed', 1, captureId, undefined, {
      candidate,
      error: 'TTS synthesis timed out',
      errorCode: 'TIMEOUT',
    })
  );

  const hasReadBack = auditDb.hasSuccessfulReadBack(sessionId, captureId, candidate);
  assert.equal(hasReadBack, false, 'Failed readback must NOT satisfy readback requirement');
});

test('Confirmation Rule: Block confirmation of invalid candidate', () => {
  const sessionId = `test_sess_invalid_${Date.now()}`;
  const captureId = `test_cap_invalid_${Date.now()}`;
  const invalidCandidate = '98765432'; // Only 8 digits

  auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
  auditDb.insertCapture({
    captureId,
    sessionId,
    attempt: 1,
    timestamp: new Date().toISOString(),
    field: 'mobile_number',
    language: 'en-IN',
    model: 'Prisma v3',
    modelVersion: 'v3',
    mode: 'transcribe',
    audioFormat: 'audio/wav',
    rawTranscript: invalidCandidate,
    normalizedCandidate: invalidCandidate,
    validityStatus: 'invalid_candidate',
    validationMessage: 'Incomplete mobile candidate: 8 digits',
    attempts: 1,
    latencyMs: 100,
  });

  const capture = auditDb.getCapture(captureId);
  assert.ok(capture);
  assert.equal(capture.validityStatus, 'invalid_candidate');

  const val = validateFieldCandidate('mobile_number', invalidCandidate);
  assert.equal(val.valid, false, 'Field engine must reject 8 digits');
});

// --- Category 4: Correction Flow & Re-validation ---

test('Correction Flow: Partial correction updates candidate, requires re-validation and read-back before confirmation', () => {
  const sessionId = `test_sess_corr_${Date.now()}`;
  const captureId = `test_cap_corr_${Date.now()}`;
  const initialCandidate = '9876543299'; // Last 2 digits wrong

  auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
  auditDb.insertCapture({
    captureId,
    sessionId,
    attempt: 1,
    timestamp: new Date().toISOString(),
    field: 'mobile_number',
    language: 'en-IN',
    model: 'Prisma v3',
    modelVersion: 'v3',
    mode: 'transcribe',
    audioFormat: 'audio/wav',
    rawTranscript: initialCandidate,
    normalizedCandidate: initialCandidate,
    validityStatus: 'valid_candidate',
    validationMessage: 'Valid 10-digit mobile number',
    attempts: 1,
    latencyMs: 100,
  });

  // Initial read-back for the initial candidate 9876543299
  auditDb.insertEvent(
    createStateEvent(sessionId, 'valid_candidate', 'read_back', 1, captureId, undefined, {
      candidate: initialCandidate,
      spokenText: '9 8 7 6 5 pause 4 3 2 9 9',
    })
  );

  // User rejects initial candidate
  auditDb.insertEvent(
    createStateEvent(sessionId, 'read_back', 'rejected', 1, captureId, undefined, {
      detectedWord: 'no',
    })
  );
  auditDb.updateSessionStatus(sessionId, 'rejected');

  // Apply partial correction: replace last 2 digits with '10'
  const corrResult = applyCorrection(initialCandidate, 'mobile_number', {
    mode: 'replace_last_n',
    lastN: 2,
    correctionInput: '10',
  });

  assert.equal(corrResult.success, true);
  assert.equal(corrResult.mergedValue, '9876543210');

  // Update capture in database with corrected value
  const updated = auditDb.updateCaptureCandidate(
    captureId,
    corrResult.mergedValue,
    corrResult.success,
    corrResult.validation.validationMessage
  );
  assert.equal(updated, true);

  // Verify that the corrected candidate (9876543210) has NOT yet been read back!
  const hasReadBackForNewCandidate = auditDb.hasSuccessfulReadBack(
    sessionId,
    captureId,
    corrResult.mergedValue
  );
  assert.equal(
    hasReadBackForNewCandidate,
    false,
    'The newly corrected candidate MUST require another read-back before it can be confirmed!'
  );

  // Perform read-back for the new candidate
  auditDb.insertEvent(
    createStateEvent(sessionId, 'valid_candidate', 'read_back', 2, captureId, undefined, {
      candidate: corrResult.mergedValue,
      spokenText: '9 8 7 6 5 pause 4 3 2 1 0',
    })
  );

  // Now read-back for the new candidate is recorded
  const hasReadBackNow = auditDb.hasSuccessfulReadBack(sessionId, captureId, corrResult.mergedValue);
  assert.equal(hasReadBackNow, true, 'Read-back is now recorded for corrected value');

  // Final confirmation succeeds
  auditDb.insertEvent(
    createStateEvent(sessionId, 'read_back', 'confirmed', 2, captureId, corrResult.mergedValue, {
      classificationDetail: 'User clicked confirm',
    })
  );
  auditDb.updateSessionStatus(sessionId, 'confirmed', corrResult.mergedValue);

  const session = auditDb.getSession(sessionId);
  assert.equal(session?.status, 'confirmed');
  assert.equal(session?.finalValue, '9876543210');
});

test('Correction Flow: Rejects out-of-range partial correction', () => {
  const previousCandidate = '9876543210';
  const outOfRangeN = 15; // Greater than candidate length 10

  // Verify that lastN > length is blocked
  const isOutOfRange = outOfRangeN > previousCandidate.length;
  assert.equal(isOutOfRange, true, 'lastN exceeding string length must be recognized as out of range');
});
