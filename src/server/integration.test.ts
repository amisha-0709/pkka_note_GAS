import test from 'node:test';
import assert from 'node:assert/strict';
import { getMaskedApiKey } from './config/environment.ts';
import { auditDb } from './persistence/database.ts';
import { runSyntheticBenchmark, benchmarkRunToCSV } from './services/syntheticBenchmarkSuite.ts';
import { createStateEvent } from '../lib/confirmationStateMachine.ts';

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

test('Integration: Benchmark suite executes B0-B3 and exports valid CSV', () => {
  const run = runSyntheticBenchmark(false);
  assert.ok(run.sampleCount >= 10);
  assert.ok(run.exactMatchB2Rate > 0);
  assert.equal(run.invalidFormatRejectionRate, 100);
  assert.equal(run.falseAcceptanceRate, 0);

  const csv = benchmarkRunToCSV(run);
  assert.match(csv, /Case ID,Category,Field/);
  assert.match(csv, /SYNTH-MOB-01/);
  assert.match(csv, /SYNTH-MOB-03-TRUNC8/);
});
