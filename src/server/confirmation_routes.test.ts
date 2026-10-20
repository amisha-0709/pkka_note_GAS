import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { confirmationRouter } from './routes/confirmation.ts';
import { readbackRouter } from './routes/readback.ts';
import { correctionRouter } from './routes/correction.ts';
import { auditDb } from './persistence/database.ts';
import { createStateEvent } from '../lib/confirmationStateMachine.ts';

describe('Route-Level HTTP Confirmation & Verification Tests', () => {
  let server: Server;
  let baseUrl: string;
  let tempDbFile: string;
  const originalFetch = globalThis.fetch;

  before(async () => {
    // 1. Isolate database to a fresh temporary file
    tempDbFile = path.join(
      os.tmpdir(),
      `pakka_note_test_db_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`
    );
    auditDb.setTestStoragePath(tempDbFile);

    // 2. Setup isolated Express app
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(confirmationRouter);
    app.use(readbackRouter);
    app.use(correctionRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      if (fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);
    } catch {}
  });

  beforeEach(() => {
    auditDb.clearForTesting();
    auditDb.setSimulateWriteFailure(false);
  });

  test('Route: Rejects confirmation before spoken read-back has occurred (HTTP 412)', async () => {
    const sessionId = `sess_norb_${Date.now()}`;
    const captureId = `cap_norb_${Date.now()}`;
    const candidate = '9876543210';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate,
        action: 'confirm',
      }),
    });

    assert.equal(res.status, 412);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.confirmed, false);
    assert.equal(json.errorCode, 'READBACK_REQUIRED');
  });

  test('Route: Rejects confirmation when read-back recorded a failure (HTTP 412)', async () => {
    const sessionId = `sess_failed_rb_${Date.now()}`;
    const captureId = `cap_failed_rb_${Date.now()}`;
    const candidate = '9876543210';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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

    // Record failed read-back
    await auditDb.insertEvent(
      createStateEvent(sessionId, 'valid_candidate', 'failed', 1, captureId, undefined, {
        candidate,
        error: 'TTS timeout',
        errorCode: 'TIMEOUT',
      })
    );

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate,
        action: 'confirm',
      }),
    });

    assert.equal(res.status, 412);
    const json = await res.json();
    assert.equal(json.confirmed, false);
    assert.equal(json.errorCode, 'READBACK_REQUIRED');
  });

  test('Route: Rejects confirmation when capture ID belongs to another session (HTTP 400)', async () => {
    const sessionA = `sess_a_${Date.now()}`;
    const sessionB = `sess_b_${Date.now()}`;
    const captureId = `cap_mismatch_${Date.now()}`;
    const candidate = '9876543210';

    await auditDb.createOrGetSession(sessionA, 'mobile_number', 'en-IN');
    await auditDb.createOrGetSession(sessionB, 'mobile_number', 'en-IN');

    await auditDb.insertCapture({
      captureId,
      sessionId: sessionA, // Capture belongs to session A
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

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionB, // Submit against Session B
        captureId,
        candidate,
        action: 'confirm',
      }),
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.confirmed, false);
    assert.equal(json.errorCode, 'CAPTURE_SESSION_MISMATCH');
  });

  test('Route: Rejects confirmation of a stale candidate (HTTP 409)', async () => {
    const sessionId = `sess_stale_${Date.now()}`;
    const captureId = `cap_stale_${Date.now()}`;
    const actualCandidate = '9876543210';
    const staleCandidate = '9876543299';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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
      rawTranscript: actualCandidate,
      normalizedCandidate: actualCandidate,
      validityStatus: 'valid_candidate',
      validationMessage: 'Valid 10-digit mobile number',
      attempts: 1,
      latencyMs: 100,
    });

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate: staleCandidate, // Stale candidate mismatch
        action: 'confirm',
      }),
    });

    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.confirmed, false);
    assert.equal(json.errorCode, 'STALE_CANDIDATE');
  });

  test('Route: Rejects confirmation of an invalid candidate (HTTP 422)', async () => {
    const sessionId = `sess_inv_${Date.now()}`;
    const captureId = `cap_inv_${Date.now()}`;
    const invalidCandidate = '98765432'; // 8 digits

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate: invalidCandidate,
        action: 'confirm',
      }),
    });

    assert.equal(res.status, 422);
    const json = await res.json();
    assert.equal(json.confirmed, false);
    assert.equal(json.errorCode, 'INVALID_CANDIDATE');
  });

  test('Route: Correction flow mandates re-read-back before confirmation can succeed', async () => {
    const sessionId = `sess_corrflow_${Date.now()}`;
    const captureId = `cap_corrflow_${Date.now()}`;
    const oldCandidate = '9876543299';
    const correctedCandidate = '9876543210';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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
      rawTranscript: oldCandidate,
      normalizedCandidate: oldCandidate,
      validityStatus: 'valid_candidate',
      validationMessage: 'Valid 10-digit mobile number',
      attempts: 1,
      latencyMs: 100,
    });

    // 1. Initial read-back happened for OLD candidate
    await auditDb.insertEvent(
      createStateEvent(sessionId, 'valid_candidate', 'read_back', 1, captureId, undefined, {
        candidate: oldCandidate,
        spokenText: '9 8 7 6 5 pause 4 3 2 9 9',
      })
    );

    // 2. User rejects old candidate
    const rejectRes = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate: oldCandidate,
        action: 'reject',
      }),
    });
    assert.equal(rejectRes.status, 200);

    // 3. User submits correction (replace last 2 digits to 10)
    const corrRes = await fetch(`${baseUrl}/api/correction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        field: 'mobile_number',
        previousCandidate: oldCandidate,
        mode: 'replace_last_n',
        lastN: 2,
        correctionInput: '10',
      }),
    });
    assert.equal(corrRes.status, 200);
    const corrJson = await corrRes.json();
    assert.equal(corrJson.mergedCandidate, correctedCandidate);
    assert.equal(corrJson.valid, true);

    // 4. Try to confirm immediately WITHOUT new read-back -> MUST FAIL (HTTP 412)
    const prematureConfirmRes = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate: correctedCandidate,
        action: 'confirm',
      }),
    });
    assert.equal(prematureConfirmRes.status, 412);
    const prematureJson = await prematureConfirmRes.json();
    assert.equal(prematureJson.errorCode, 'READBACK_REQUIRED');
    assert.equal(prematureJson.confirmed, false);

    // 5. Mock TTS to simulate successful read-back for the corrected candidate
    const originalApiKey = process.env.GNANI_API_KEY;
    process.env.GNANI_API_KEY = 'mock_key_for_route_test';
    const validAudioBase64 =
      'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' +
      'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('tts') || urlStr.includes('vachana')) {
        return new Response(
          JSON.stringify({
            audio_content: validAudioBase64,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    };

    // Perform read-back for the new corrected candidate
    const rbRes = await fetch(`${baseUrl}/api/readback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        field: 'mobile_number',
        language: 'en-IN',
        candidate: correctedCandidate,
      }),
    });
    assert.equal(rbRes.status, 200);

    // 6. Now confirm the corrected candidate -> MUST SUCCEED (HTTP 200)
    const finalConfirmRes = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate: correctedCandidate,
        action: 'confirm',
      }),
    });
    assert.equal(finalConfirmRes.status, 200);
    const finalJson = await finalConfirmRes.json();
    assert.equal(finalJson.confirmed, true);
    assert.equal(finalJson.finalValue, correctedCandidate);

    globalThis.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.GNANI_API_KEY = originalApiKey;
    } else {
      delete process.env.GNANI_API_KEY;
    }
  });

  test('Route: Unclear voice input yields uncertain state and does not confirm candidate', async () => {
    const sessionId = `sess_unclear_${Date.now()}`;
    const captureId = `cap_unclear_${Date.now()}`;
    const candidate = '9876543210';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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

    await auditDb.insertEvent(
      createStateEvent(sessionId, 'valid_candidate', 'read_back', 1, captureId, undefined, {
        candidate,
        spokenText: '9 8 7 6 5 4 3 2 1 0',
      })
    );

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate,
        action: 'voice_input',
        spokenText: 'maybe nine or eight',
      }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.confirmed, false);
    assert.equal(json.newState, 'uncertain');

    const session = auditDb.getSession(sessionId);
    assert.notEqual(session?.status, 'confirmed');
    assert.equal(session?.finalValue, undefined);
  });

  test('Route: Duplicate confirmation and invalid state transitions are rejected (HTTP 409)', async () => {
    const sessionId = `sess_dup_${Date.now()}`;
    const captureId = `cap_dup_${Date.now()}`;
    const candidate = '9876543210';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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

    await auditDb.insertEvent(
      createStateEvent(sessionId, 'valid_candidate', 'read_back', 1, captureId, undefined, {
        candidate,
        spokenText: '9 8 7 6 5 4 3 2 1 0',
      })
    );

    // First confirmation: succeeds
    const firstRes = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate,
        action: 'confirm',
      }),
    });
    assert.equal(firstRes.status, 200);

    // Second confirmation on already confirmed session: MUST FAIL (HTTP 409)
    const secondRes = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate,
        action: 'confirm',
      }),
    });
    assert.equal(secondRes.status, 409);
    const secondJson = await secondRes.json();
    assert.equal(secondJson.confirmed, false);
    assert.equal(secondJson.errorCode, 'INVALID_STATE_TRANSITION');
  });

  test('Route: Audit persistence failure aborts confirmation and returns HTTP 500 without finalization', async () => {
    const sessionId = `sess_persist_fail_${Date.now()}`;
    const captureId = `cap_persist_fail_${Date.now()}`;
    const candidate = '9876543210';

    await auditDb.createOrGetSession(sessionId, 'mobile_number', 'en-IN');
    await auditDb.insertCapture({
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

    await auditDb.insertEvent(
      createStateEvent(sessionId, 'valid_candidate', 'read_back', 1, captureId, undefined, {
        candidate,
        spokenText: '9 8 7 6 5 4 3 2 1 0',
      })
    );

    // Simulate disk/audit write failure
    auditDb.setSimulateWriteFailure(true);

    const res = await fetch(`${baseUrl}/api/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        captureId,
        candidate,
        action: 'confirm',
      }),
    });

    assert.equal(res.status, 500);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.confirmed, false);
    assert.equal(json.errorCode, 'AUDIT_PERSISTENCE_FAILED');

    // Confirm that session in memory was NOT finalized
    const session = auditDb.getSession(sessionId);
    assert.notEqual(session?.status, 'confirmed');
    assert.equal(session?.finalValue, undefined);

    auditDb.setSimulateWriteFailure(false);
  });
});
