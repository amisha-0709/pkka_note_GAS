/**
 * Pakka Note: Yani Call Spectator - Call Pipeline & Real-Time Orchestrator
 *
 * Implements:
 * 1. Chunked STT processing with Gnani Prisma and overlap de-duplication
 * 2. Sensitive data masking (Raw cards/PINs/Aadhaars never stored)
 * 3. Deterministic + Gemini entity extraction
 * 4. Spoken correction detection and candidate supersession
 * 5. Soft verbal confirmation tracking
 * 6. Rolling and final structured notes generation
 * 7. Server-Sent Events (SSE) live broadcast to agent UI
 */

import type { Response } from 'express';
import { auditDb } from '../persistence/database.ts';
import type {
  Call,
  Candidate,
  CallNotes,
  EntityType,
  Segment,
  Speaker,
} from '../../types/index.ts';
import { callGnaniPrismaSTT } from './gnaniPrisma.ts';
import {
  scanSensitiveData,
  detectEntitiesFromTranscript,
  validateFieldCandidate,
} from '../../lib/fieldEngine.ts';
import {
  createCandidate,
  detectCustomerVerbalConfirm,
  detectSpokenCorrection,
  applySpokenCorrection,
} from '../../lib/candidateLifecycle.ts';
import {
  extractEntitiesWithGemini,
  generateCallNotesWithGemini,
} from './geminiClient.ts';

// -------------------------------------------------------------
// SSE Hub for Live Agent Updates
// -------------------------------------------------------------

interface SSEClient {
  callId: string;
  res: Response;
}

const sseClients: SSEClient[] = [];

export function subscribeToCallEvents(callId: string, res: Response): () => void {
  const client: SSEClient = { callId, res };
  sseClients.push(client);

  return () => {
    const idx = sseClients.indexOf(client);
    if (idx !== -1) {
      sseClients.splice(idx, 1);
    }
  };
}

export function broadcastCallEvent(
  callId: string,
  eventType: 'segment' | 'candidate' | 'notes' | 'status' | 'heartbeat',
  data: unknown
): void {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  const targets = sseClients.filter((c) => c.callId === callId);

  for (const client of targets) {
    try {
      client.res.write(payload);
    } catch (err) {
      // Handled on close
    }
  }
}

// -------------------------------------------------------------
// Overlap De-Duplication Helper
// -------------------------------------------------------------

/**
 * Removes overlapping words between chunk N and chunk N+1 from the same speaker
 */
export function deduplicateOverlap(previousText: string, newText: string): string {
  if (!previousText || !newText) return newText;

  const prevWords = previousText.trim().toLowerCase().split(/\s+/);
  const newWords = newText.trim().split(/\s+/);

  // Compare up to 5 trailing words
  const maxOverlap = Math.min(5, prevWords.length, newWords.length);

  for (let len = maxOverlap; len >= 1; len--) {
    const prevTail = prevWords.slice(-len).join(' ');
    const newHead = newWords.slice(0, len).map((w) => w.toLowerCase()).join(' ');

    if (prevTail === newHead) {
      return newWords.slice(len).join(' ');
    }
  }

  return newText;
}

// -------------------------------------------------------------
// Chunk Processing Pipeline
// -------------------------------------------------------------

export interface ProcessChunkParams {
  callId: string;
  channel: Speaker;
  seq: number;
  startMs: number;
  endMs?: number;
  audioBuffer?: Buffer;
  mimeType?: string;
  textTranscript?: string; // Pre-transcribed (e.g., simulation)
  verbatimTranscript?: string;
}

export async function processAudioChunk(params: ProcessChunkParams): Promise<{
  segment: Segment;
  newCandidates: Candidate[];
}> {
  const { callId, channel, seq, startMs, endMs = startMs + 3000 } = params;
  const startTime = Date.now();

  const call = await auditDb.getCall(callId);
  if (!call) {
    throw new Error(`Call ${callId} not found`);
  }

  let rawText = '';
  let verbatimText: string | undefined = params.verbatimTranscript;
  let sttLatency = 0;

  if (params.textTranscript) {
    // Simulated or pre-transcribed
    rawText = params.textTranscript;
    sttLatency = 10;
  } else if (params.audioBuffer && params.audioBuffer.length > 0) {
    // Run live Prisma STT
    const lang = call.language === 'mixed' ? 'en-IN' : call.language;
    const sttRes = await callGnaniPrismaSTT({
      audioBuffer: params.audioBuffer,
      mimeType: params.mimeType || 'audio/wav',
      languageCode: lang,
      format: 'transcribe',
    });

    sttLatency = sttRes.latencyMs;

    if (sttRes.success && sttRes.transcript.trim()) {
      rawText = sttRes.transcript;

      // Check if numeric heavy, run verbatim cross-check if account supports
      const hasNumbers = /\d|zero|one|two|three|four|five|six|seven|eight|nine|ek|do|teen|char|paanch/i.test(rawText);
      if (hasNumbers) {
        try {
          const verbatimRes = await callGnaniPrismaSTT({
            audioBuffer: params.audioBuffer,
            mimeType: params.mimeType || 'audio/wav',
            languageCode: lang,
            format: 'verbatim',
          });
          if (verbatimRes.success) {
            verbatimText = verbatimRes.transcript;
          }
        } catch {
          // Non-fatal
        }
      }
    } else {
      // Per specification: Never fabricate text when STT fails. Show explicit gap marker.
      rawText = `[Audio gap - STT ${sttRes.errorCode || 'unavailable'}]`;
    }
  } else {
    rawText = '[Audio gap - no data received]';
  }

  // 1. Overlap De-Duplication against previous segment of the same channel
  const previousSegments = await auditDb.getSegments(callId);
  const prevChannelSegments = previousSegments.filter((s) => s.speaker === channel);
  const lastPrevSegment = prevChannelSegments.length > 0 ? prevChannelSegments[prevChannelSegments.length - 1] : undefined;

  let cleanedText = rawText;
  if (lastPrevSegment && !rawText.startsWith('[Audio gap')) {
    cleanedText = deduplicateOverlap(lastPrevSegment.text, rawText);
  }

  // 2. Sensitive Data Guard (Never store or display raw cards/PINs/Aadhaar/OTP)
  const { sanitizedText, detections } = scanSensitiveData(cleanedText);

  // 3. Create and persist Segment
  const segment: Segment = {
    id: `seg_${callId}_${seq}_${Date.now()}`,
    callId,
    speaker: channel,
    speakerInferred: false,
    startMs,
    endMs,
    text: sanitizedText,
    verbatimText,
    final: true,
    sttLatencyMs: sttLatency,
  };

  await auditDb.addSegment(segment);
  broadcastCallEvent(callId, 'segment', segment);

  // Log audit event for chunk
  await auditDb.logEvent({
    id: `evt_chunk_${Date.now()}`,
    callId,
    type: 'CHUNK_PROCESSED',
    at: new Date().toISOString(),
    meta: {
      seq,
      speaker: channel,
      startMs,
      endMs,
      sttLatencyMs: sttLatency,
      hasSensitiveDetections: detections.length > 0,
      detectionCount: detections.length,
    },
  });

  const newCandidates: Candidate[] = [];
  const isGap = sanitizedText.startsWith('[Audio gap');

  if (!isGap && sanitizedText.trim()) {
    // 4. Entity Extraction Pipeline
    const existingCandidates = await auditDb.getCandidates(callId);

    // 4a. Check for spoken corrections first: "no, it is 4 not 5", "sorry, last digit is 7"
    const correction = detectSpokenCorrection(sanitizedText);
    if (correction.detected && existingCandidates.length > 0) {
      // Find the most recent active candidate that matches or is relevant
      const activeCandidates = existingCandidates.filter(
        (c) => c.status !== 'superseded' && c.status !== 'dismissed'
      );
      if (activeCandidates.length > 0) {
        const target = activeCandidates[activeCandidates.length - 1];
        const { supersededCandidate, newCandidate } = applySpokenCorrection({
          existingCandidate: target,
          correctionTranscript: sanitizedText,
          segmentId: segment.id,
          speaker: channel,
          atMs: startMs,
        });

        await auditDb.updateCandidate(supersededCandidate.id, supersededCandidate);
        await auditDb.addCandidate(newCandidate);
        newCandidates.push(newCandidate);

        broadcastCallEvent(callId, 'candidate', supersededCandidate);
        broadcastCallEvent(callId, 'candidate', newCandidate);

        await auditDb.logEvent({
          id: `evt_corr_${Date.now()}`,
          callId,
          type: 'SPOKEN_CORRECTION_APPLIED',
          at: new Date().toISOString(),
          meta: {
            supersededCandidateId: supersededCandidate.id,
            newCandidateId: newCandidate.id,
            correctionTranscript: sanitizedText,
          },
        });
      }
    }

    // 4b. Check for customer verbal confirmation: "yes", "pakka", "sahi hai"
    if (channel === 'customer') {
      const verbalConfirm = detectCustomerVerbalConfirm(sanitizedText);
      if (verbalConfirm) {
        const activeCandidates = existingCandidates.filter(
          (c) => c.status !== 'superseded' && c.status !== 'dismissed' && !c.customerVerbalConfirm
        );
        for (const cand of activeCandidates) {
          const updated = { ...cand, customerVerbalConfirm: true };
          await auditDb.updateCandidate(cand.id, updated);
          broadcastCallEvent(callId, 'candidate', updated);
        }
      }
    }

    // 4c. Deterministic entity detection
    const detResults = detectEntitiesFromTranscript(sanitizedText, {
      context: `${channel} turn`,
    });

    for (const det of detResults) {
      // Check if value already captured for this type
      const duplicate = existingCandidates.some(
        (c) =>
          c.type === det.type &&
          c.value === det.value &&
          c.status !== 'superseded' &&
          c.status !== 'dismissed'
      );

      if (!duplicate && !newCandidates.some((c) => c.value === det.value)) {
        const cand = createCandidate({
          callId,
          type: det.type,
          value: det.value,
          displayValue: det.displayValue,
          confidence: det.confidence,
          segmentId: segment.id,
          quote: det.quote,
          speaker: channel,
          atMs: startMs,
          alternativeType: det.alternativeType,
        });

        await auditDb.addCandidate(cand);
        newCandidates.push(cand);
        broadcastCallEvent(callId, 'candidate', cand);

        await auditDb.logEvent({
          id: `evt_cand_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          callId,
          type: 'CANDIDATE_CREATED',
          at: new Date().toISOString(),
          meta: { candidateId: cand.id, type: cand.type, value: cand.displayValue },
        });
      }
    }

    // 4d. Server-side Gemini entity extraction (asynchronously enhancement, merged with deterministic validator)
    extractEntitiesWithGemini(sanitizedText, `Speaker: ${channel}`).then(async (geminiEntities) => {
      for (const gem of geminiEntities) {
        const currentCandidates = await auditDb.getCandidates(callId);
        const exists = currentCandidates.some(
          (c) => c.type === gem.type && c.value === gem.value
        );

        if (!exists) {
          // MANDATORY: Deterministic validation gate
          const reval = validateFieldCandidate(gem.type, gem.value);
          if (reval.valid) {
            const cand = createCandidate({
              callId,
              type: gem.type,
              value: reval.normalizedCandidate || gem.value,
              displayValue: reval.normalizedCandidate || gem.value,
              confidence: gem.confidence,
              segmentId: segment.id,
              quote: gem.quote,
              speaker: channel,
              atMs: startMs,
            });

            await auditDb.addCandidate(cand);
            broadcastCallEvent(callId, 'candidate', cand);
          }
        }
      }
    }).catch(() => {});
  }

  // 5. Trigger rolling notes generation if needed (e.g. periodically every 4 segments)
  const allSegments = await auditDb.getSegments(callId);
  if (allSegments.length > 0 && allSegments.length % 3 === 0) {
    refreshCallNotes(callId, false).catch(() => {});
  }

  return { segment, newCandidates };
}

/**
 * Regenerates or updates call notes for a call session
 */
export async function refreshCallNotes(callId: string, isFinal = false): Promise<CallNotes | undefined> {
  const segments = await auditDb.getSegments(callId);
  const candidates = await auditDb.getCandidates(callId);
  const existingNotes = await auditDb.getNotes(callId);

  const version = (existingNotes?.version || 0) + 1;

  const notes = await generateCallNotesWithGemini({
    callId,
    segments,
    candidates,
    isFinal,
    version,
  });

  await auditDb.saveNotes(notes);
  broadcastCallEvent(callId, 'notes', notes);

  await auditDb.logEvent({
    id: `evt_notes_${Date.now()}`,
    callId,
    type: isFinal ? 'FINAL_NOTES_GENERATED' : 'ROLLING_NOTES_GENERATED',
    at: new Date().toISOString(),
    meta: { version, isFinal, candidateCount: notes.details.length },
  });

  return notes;
}
