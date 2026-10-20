/**
 * Pakka Note: Yani Call Spectator - Call API Routes
 *
 * Implements Section 9 & 11 API specifications:
 * - POST /api/calls
 * - POST /api/calls/:id/chunk
 * - GET /api/calls/:id/events (SSE)
 * - POST /api/calls/:id/pause, resume, end
 * - PATCH /api/calls/:id/candidates/:cid
 * - GET /api/calls/:id
 * - POST /api/calls/:id/notes/regenerate
 * - GET /api/calls/:id/export?format=md|json
 * - DELETE /api/calls/:id
 * - POST /api/calls/simulate/:scriptId
 */

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { auditDb } from '../persistence/database.ts';
import type { Call, Candidate, Speaker } from '../../types/index.ts';

const { Router } = express;
import {
  processAudioChunk,
  refreshCallNotes,
  subscribeToCallEvents,
  broadcastCallEvent,
} from '../services/callPipeline.ts';
import { applyAgentAction } from '../../lib/candidateLifecycle.ts';
import { SCRIPTED_CALLS } from '../services/simulatedCalls.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB chunk limit
});

export const callsRouter = Router();

/**
 * POST /api/calls
 * Create a new call session
 */
callsRouter.post('/', async (req: Request, res: Response) => {
  const { mode = 'live', language = 'en-IN', templateId, consentShown = true } = req.body;

  const validModes = ['live', 'simulated', 'upload'];
  const validLangs = ['en-IN', 'hi-IN', 'mixed'];

  const selectedMode = validModes.includes(mode) ? mode : 'live';
  const selectedLang = validLangs.includes(language) ? language : 'en-IN';

  const call: Call = {
    id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    startedAt: new Date().toISOString(),
    mode: selectedMode,
    state: 'listening',
    language: selectedLang,
    consentShown: Boolean(consentShown),
    templateId: templateId || 'standard_support',
  };

  await auditDb.createCall(call);

  await auditDb.logEvent({
    id: `evt_call_start_${Date.now()}`,
    callId: call.id,
    type: 'CALL_STARTED',
    at: new Date().toISOString(),
    meta: { mode: call.mode, language: call.language, consentShown: call.consentShown },
  });

  return res.status(201).json({
    success: true,
    call,
  });
});

/**
 * GET /api/calls
 * List all past and active calls
 */
callsRouter.get('/', async (_req: Request, res: Response) => {
  const calls = await auditDb.listCalls();
  return res.json({
    success: true,
    calls,
  });
});

/**
 * GET /api/calls/:id
 * Retrieve call with all segments, candidates, and notes
 */
callsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const call = await auditDb.getCall(id);
  if (!call) {
    return res.status(404).json({
      success: false,
      errorCode: 'CALL_NOT_FOUND',
      message: `Call with ID "${id}" was not found.`,
    });
  }

  const segments = await auditDb.getSegments(id);
  const candidates = await auditDb.getCandidates(id);
  const notes = await auditDb.getNotes(id);

  return res.json({
    success: true,
    call,
    segments,
    candidates,
    notes,
  });
});

/**
 * GET /api/calls/:id/events
 * Server-Sent Events (SSE) live updates for the call
 */
callsRouter.get('/:id/events', async (req: Request, res: Response) => {
  const { id } = req.params;
  const call = await auditDb.getCall(id);
  if (!call) {
    return res.status(404).json({
      success: false,
      errorCode: 'CALL_NOT_FOUND',
      message: `Call "${id}" not found.`,
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial snapshot
  const initialSegments = await auditDb.getSegments(id);
  const initialCandidates = await auditDb.getCandidates(id);
  const initialNotes = await auditDb.getNotes(id);

  res.write(`event: status\ndata: ${JSON.stringify({ state: call.state, call })}\n\n`);
  for (const seg of initialSegments) {
    res.write(`event: segment\ndata: ${JSON.stringify(seg)}\n\n`);
  }
  for (const cand of initialCandidates) {
    res.write(`event: candidate\ndata: ${JSON.stringify(cand)}\n\n`);
  }
  if (initialNotes) {
    res.write(`event: notes\ndata: ${JSON.stringify(initialNotes)}\n\n`);
  }

  // Subscribe to subsequent live broadcasts
  const unsubscribe = subscribeToCallEvents(id, res);

  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/**
 * POST /api/calls/:id/chunk
 * Process a single audio chunk or text turn
 * Returns 202 quickly while pipeline runs
 */
callsRouter.post('/:id/chunk', upload.single('audio'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const call = await auditDb.getCall(id);
  if (!call) {
    return res.status(404).json({
      success: false,
      errorCode: 'CALL_NOT_FOUND',
      message: `Call "${id}" not found.`,
    });
  }

  if (call.state === 'ended') {
    return res.status(400).json({
      success: false,
      errorCode: 'CALL_ALREADY_ENDED',
      message: 'Cannot send chunks to an ended call session.',
    });
  }

  const channel = (req.body.channel as Speaker) || 'customer';
  const seq = parseInt(req.body.seq || '0', 10);
  const startMs = parseInt(req.body.startMs || '0', 10);
  const endMs = req.body.endMs ? parseInt(req.body.endMs, 10) : startMs + 3000;
  const textTranscript = req.body.textTranscript || req.body.transcript;
  const verbatimTranscript = req.body.verbatimTranscript;

  const audioBuffer = req.file?.buffer;
  const mimeType = req.file?.mimetype || 'audio/wav';

  // Process chunk asynchronously in pipeline
  processAudioChunk({
    callId: id,
    channel,
    seq,
    startMs,
    endMs,
    audioBuffer,
    mimeType,
    textTranscript,
    verbatimTranscript,
  }).catch((err) => {
    console.error(`[CallPipeline] Error processing chunk for call ${id}:`, err);
  });

  // Return HTTP 202 Accepted quickly per specification
  return res.status(202).json({
    success: true,
    message: 'Chunk accepted for processing.',
    seq,
    channel,
  });
});

/**
 * POST /api/calls/:id/pause
 */
callsRouter.post('/:id/pause', async (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = await auditDb.updateCall(id, { state: 'paused' });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Call not found' });
  }

  broadcastCallEvent(id, 'status', { state: 'paused' });
  return res.json({ success: true, state: 'paused' });
});

/**
 * POST /api/calls/:id/resume
 */
callsRouter.post('/:id/resume', async (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = await auditDb.updateCall(id, { state: 'listening' });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Call not found' });
  }

  broadcastCallEvent(id, 'status', { state: 'listening' });
  return res.json({ success: true, state: 'listening' });
});

/**
 * POST /api/calls/:id/end
 * Ends the call and triggers final notes generation
 */
callsRouter.post('/:id/end', async (req: Request, res: Response) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const updated = await auditDb.updateCall(id, {
    state: 'ended',
    endedAt: now,
  });

  if (!updated) {
    return res.status(404).json({ success: false, message: 'Call not found' });
  }

  broadcastCallEvent(id, 'status', { state: 'ended', endedAt: now });

  // Generate final notes
  const notes = await refreshCallNotes(id, true);

  await auditDb.logEvent({
    id: `evt_call_end_${Date.now()}`,
    callId: id,
    type: 'CALL_ENDED',
    at: now,
    meta: { durationMs: new Date(now).getTime() - new Date(updated.startedAt).getTime() },
  });

  return res.json({
    success: true,
    call: updated,
    notes,
  });
});

/**
 * PATCH /api/calls/:id/candidates/:cid
 * Agent actions: confirm, edit (with value), dismiss
 */
callsRouter.patch('/:id/candidates/:cid', async (req: Request, res: Response) => {
  const { id, cid } = req.params;
  const { action, value } = req.body;

  if (!action || !['confirm', 'edit', 'dismiss'].includes(action)) {
    return res.status(400).json({
      success: false,
      errorCode: 'INVALID_ACTION',
      message: 'Action must be "confirm", "edit", or "dismiss".',
    });
  }

  const candidate = await auditDb.getCandidate(cid);
  if (!candidate || candidate.callId !== id) {
    return res.status(404).json({
      success: false,
      errorCode: 'CANDIDATE_NOT_FOUND',
      message: `Candidate "${cid}" for call "${id}" not found.`,
    });
  }

  const { candidate: updated, previousStatus } = applyAgentAction(candidate, {
    action,
    value,
    agentId: 'agent',
  });

  await auditDb.updateCandidate(cid, updated);
  broadcastCallEvent(id, 'candidate', updated);

  await auditDb.logEvent({
    id: `evt_cand_action_${Date.now()}`,
    callId: id,
    type: `CANDIDATE_${action.toUpperCase()}`,
    at: new Date().toISOString(),
    meta: {
      candidateId: cid,
      previousStatus,
      newStatus: updated.status,
      value: updated.value,
    },
  });

  return res.json({
    success: true,
    candidate: updated,
  });
});

/**
 * POST /api/calls/:id/notes/regenerate
 */
callsRouter.post('/:id/notes/regenerate', async (req: Request, res: Response) => {
  const { id } = req.params;
  const call = await auditDb.getCall(id);
  if (!call) {
    return res.status(404).json({ success: false, message: 'Call not found' });
  }

  const isFinal = call.state === 'ended' || call.state === 'reviewed';
  const notes = await refreshCallNotes(id, isFinal);

  return res.json({
    success: true,
    notes,
  });
});

/**
 * GET /api/calls/:id/export?format=md|json
 * Export structured call notes
 */
callsRouter.get('/:id/export', async (req: Request, res: Response) => {
  const { id } = req.params;
  const format = req.query.format === 'json' ? 'json' : 'md';

  const call = await auditDb.getCall(id);
  if (!call) {
    return res.status(404).json({ success: false, message: 'Call not found' });
  }

  const notes = await auditDb.getNotes(id);
  const candidates = await auditDb.getCandidates(id);
  const segments = await auditDb.getSegments(id);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="call_${id}_notes.json"`);
    return res.json({
      call,
      notes,
      candidates,
      segmentsCount: segments.length,
      exportedAt: new Date().toISOString(),
    });
  }

  // Markdown format
  let md = `# Call Notes: ${call.id}\n\n`;
  md += `**Started At:** ${call.startedAt}\n`;
  md += `**Ended At:** ${call.endedAt || 'In Progress'}\n`;
  md += `**Mode:** ${call.mode} | **Language:** ${call.language}\n\n`;

  if (notes) {
    md += `## Summary\n${notes.summary}\n\n`;
    md += `## Customer Issue\n${notes.issue}\n\n`;

    md += `## Captured Details\n`;
    if (notes.details.length === 0) {
      md += `*No details captured.*\n\n`;
    } else {
      for (const d of notes.details) {
        md += `- **${d.label}:** \`${d.value}\`\n`;
      }
      md += `\n`;
    }

    md += `## Actions Promised\n`;
    if (notes.actions.length === 0) {
      md += `*None stated.*\n\n`;
    } else {
      for (const a of notes.actions) {
        md += `- ${a}\n`;
      }
      md += `\n`;
    }

    md += `## Follow-Ups\n`;
    for (const f of notes.followUps) {
      md += `- ${f}\n`;
    }
    md += `\n`;

    if (notes.openItems.length > 0) {
      md += `## Open Items\n`;
      for (const o of notes.openItems) {
        md += `- ${o}\n`;
      }
      md += `\n`;
    }
  }

  md += `## Full Transcript\n`;
  for (const s of segments) {
    md += `**[${s.speaker.toUpperCase()} - ${Math.round(s.startMs / 1000)}s]:** ${s.text}\n\n`;
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="call_${id}_notes.md"`);
  return res.send(md);
});

/**
 * DELETE /api/calls/:id
 * Purge all data for a specific call
 */
callsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = await auditDb.deleteCall(id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: `Call with ID "${id}" was not found.`,
    });
  }

  return res.json({
    success: true,
    message: `Call "${id}" and all associated data purged successfully.`,
  });
});

/**
 * POST /api/calls/simulate/:scriptId
 * Starts automated replay of a scripted synthetic call into the pipeline
 */
callsRouter.post('/simulate/:scriptId', async (req: Request, res: Response) => {
  const { scriptId } = req.params;
  const script = SCRIPTED_CALLS[scriptId];
  if (!script) {
    return res.status(404).json({
      success: false,
      errorCode: 'SCRIPT_NOT_FOUND',
      message: `Simulation script "${scriptId}" not found. Available: ${Object.keys(SCRIPTED_CALLS).join(', ')}`,
    });
  }

  // Create a simulated call session
  const call: Call = {
    id: `sim_${scriptId}_${Date.now()}`,
    startedAt: new Date().toISOString(),
    mode: 'simulated',
    state: 'listening',
    language: 'en-IN',
    consentShown: true,
    templateId: scriptId,
  };

  await auditDb.createCall(call);

  // Replay turns with realistic timing in background
  (async () => {
    let currentMs = 0;
    for (let i = 0; i < script.turns.length; i++) {
      const turn = script.turns[i];
      currentMs += turn.delayMs;

      // Small delay between turns for realistic live simulation (fast in tests)
      const turnDelay = process.env.NODE_ENV === 'test' ? 10 : Math.min(1200, turn.delayMs / 2);
      await new Promise((resolve) => setTimeout(resolve, turnDelay));

      await processAudioChunk({
        callId: call.id,
        channel: turn.speaker,
        seq: i + 1,
        startMs: currentMs,
        endMs: currentMs + turn.delayMs,
        textTranscript: turn.text,
        verbatimTranscript: turn.verbatimText,
      });
    }

    // Call finishes
    const now = new Date().toISOString();
    await auditDb.updateCall(call.id, { state: 'ended', endedAt: now });
    broadcastCallEvent(call.id, 'status', { state: 'ended', endedAt: now });
    await refreshCallNotes(call.id, true);
  })().catch((err) => {
    console.error(`[Simulation] Error replaying script ${scriptId}:`, err);
  });

  return res.status(201).json({
    success: true,
    call,
    script: {
      scriptId: script.scriptId,
      title: script.title,
      turnsCount: script.turns.length,
      expectedGroundTruth: script.expectedGroundTruth,
    },
  });
});
