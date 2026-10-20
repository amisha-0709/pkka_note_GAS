/**
 * Route-Level HTTP Tests for Yani Call Spectator Call API
 * Tests against real Express server instances with test isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { callsRouter } from './routes/calls.ts';
import { auditDb } from './persistence/database.ts';
import { deduplicateOverlap } from './services/callPipeline.ts';

function createTestServer(): Promise<{ server: http.Server; url: string }> {
  const app = express();
  app.use(express.json());
  app.use('/api/calls', callsRouter);
  app.use('/api/simulate', (req, res, next) => {
    req.url = `/simulate${req.url}`;
    callsRouter(req, res, next);
  });

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

test('Deduplicate Overlap: Strips overlapping words between consecutive chunks', () => {
  const prevText = 'Hello my name is Rahul Sharma';
  const newChunk = 'Rahul Sharma my mobile number is nine eight seven';
  const deduplicated = deduplicateOverlap(prevText, newChunk);

  assert.equal(deduplicated, 'my mobile number is nine eight seven');
});

test('Call Routes: Full Call Lifecycle, Chunk Ingestion, Candidate Extraction, and Export', async () => {
  const { server, url } = await createTestServer();

  try {
    // 1. Create Call
    const createRes = await fetch(`${url}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'simulated', language: 'en-IN' }),
    });
    assert.equal(createRes.status, 201);
    const createBody = (await createRes.json()) as any;
    assert.equal(createBody.success, true);
    assert.ok(createBody.call.id);
    const callId = createBody.call.id;

    // 2. Ingest first chunk (customer introduces themselves)
    const chunk1Res = await fetch(`${url}/api/calls/${callId}/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'customer',
        seq: 1,
        startMs: 1000,
        endMs: 3500,
        textTranscript: 'Hello my name is Rahul Sharma, my mobile is nine eight seven six five four three two one zero.',
      }),
    });
    assert.equal(chunk1Res.status, 202);

    // Give pipeline a brief moment to process
    await new Promise((r) => setTimeout(r, 100));

    // 3. Inspect Call details
    const getRes = await fetch(`${url}/api/calls/${callId}`);
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as any;
    assert.equal(getBody.success, true);
    assert.ok(getBody.segments.length >= 1);
    assert.ok(getBody.candidates.length >= 1);

    const mobileCand = getBody.candidates.find((c: any) => c.type === 'mobile');
    assert.ok(mobileCand);
    assert.equal(mobileCand.value, '9876543210');
    assert.equal(mobileCand.status, 'detected'); // Never auto-confirmed!

    // 4. Agent Confirms Candidate
    const patchRes = await fetch(`${url}/api/calls/${callId}/candidates/${mobileCand.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = (await patchRes.json()) as any;
    assert.equal(patchBody.candidate.status, 'confirmed');

    // 5. Ingest chunk with correction: "no, sorry, last digit is 7"
    const corrRes = await fetch(`${url}/api/calls/${callId}/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'customer',
        seq: 2,
        startMs: 4000,
        endMs: 6500,
        textTranscript: 'Wait, sorry, last digit is 7, nine eight seven six five four three two one seven.',
      }),
    });
    assert.equal(corrRes.status, 202);

    await new Promise((r) => setTimeout(r, 100));

    const checkCorrRes = await fetch(`${url}/api/calls/${callId}`);
    const checkCorrBody = (await checkCorrRes.json()) as any;
    const oldMobile = checkCorrBody.candidates.find((c: any) => c.id === mobileCand.id);
    assert.equal(oldMobile.status, 'superseded');

    const newMobile = checkCorrBody.candidates.find(
      (c: any) => c.supersedes === mobileCand.id
    );
    assert.ok(newMobile);
    assert.equal(newMobile.value, '9876543217');

    // 6. Pause and Resume Call
    const pauseRes = await fetch(`${url}/api/calls/${callId}/pause`, { method: 'POST' });
    assert.equal(pauseRes.status, 200);
    const resumeRes = await fetch(`${url}/api/calls/${callId}/resume`, { method: 'POST' });
    assert.equal(resumeRes.status, 200);

    // 7. End Call
    const endRes = await fetch(`${url}/api/calls/${callId}/end`, { method: 'POST' });
    assert.equal(endRes.status, 200);
    const endBody = (await endRes.json()) as any;
    assert.equal(endBody.call.state, 'ended');
    assert.ok(endBody.notes);

    // 8. Export notes in Markdown
    const exportMdRes = await fetch(`${url}/api/calls/${callId}/export?format=md`);
    assert.equal(exportMdRes.status, 200);
    const mdText = await exportMdRes.text();
    assert.ok(mdText.includes('Call Notes'));
    assert.ok(mdText.includes('9876543217'));

    // 9. Export notes in JSON
    const exportJsonRes = await fetch(`${url}/api/calls/${callId}/export?format=json`);
    assert.equal(exportJsonRes.status, 200);
    const jsonExp = (await exportJsonRes.json()) as any;
    assert.ok(jsonExp.call);
    assert.ok(jsonExp.candidates);

    // 10. Purge Call
    const delRes = await fetch(`${url}/api/calls/${callId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    const getAfterDel = await fetch(`${url}/api/calls/${callId}`);
    assert.equal(getAfterDel.status, 404);
  } finally {
    server.close();
  }
});

test('Simulation Route: Starts scripted call and returns definition', async () => {
  const { server, url } = await createTestServer();

  try {
    const res = await fetch(`${url}/api/simulate/clean_support_call`, { method: 'POST' });
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.call.mode, 'simulated');
    assert.equal(body.script.scriptId, 'clean_support_call');
    assert.ok(body.script.turnsCount > 0);
  } finally {
    server.close();
  }
});
