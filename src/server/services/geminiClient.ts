/**
 * Pakka Note: Yani Call Spectator - Server-Side Gemini Client
 * Uses @google/genai SDK strictly on the server-side with 'User-Agent: aistudio-build'.
 * Never exposes API keys to client or logs.
 * Provides fallback to deterministic engine if API key is not configured or if requests fail.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Candidate, CallNotes, CallNotesDetail, EntityType, Segment } from '../../types/index.ts';
import { validateFieldCandidate, scanSensitiveData } from '../../lib/fieldEngine.ts';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

let aiClient: GoogleGenAI | null = null;
if (GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('[GeminiClient] Failed to initialize GoogleGenAI client:', err);
  }
}

export function isGeminiAvailable(): boolean {
  return Boolean(aiClient && GEMINI_API_KEY);
}

export function getGeminiModelName(): string {
  return GEMINI_MODEL;
}

export interface ExtractedEntityRaw {
  type: EntityType;
  value: string;
  quote: string;
  confidence: number;
}

/**
 * Extracts candidate entities using Gemini with a strict JSON schema,
 * followed by mandatory deterministic validation.
 * Any Gemini extraction that fails deterministic validation MUST NEVER appear as valid.
 */
export async function extractEntitiesWithGemini(
  transcriptText: string,
  context?: string
): Promise<ExtractedEntityRaw[]> {
  if (process.env.NODE_ENV === 'test' || !aiClient || !transcriptText.trim()) {
    return [];
  }

  // Pre-filter sensitive data before sending to prompt
  const { sanitizedText } = scanSensitiveData(transcriptText);

  try {
    const prompt = `You are Yani, an entity spotting engine for a customer service call.
Extract unique identifiers spoken by the caller or agent:
- mobile: 10-digit Indian mobile number
- email: email address
- imei: 15-digit device IMEI
- serial: 8-20 character hardware serial number
- order_id: order or ticket ID (like ORD12345678)
- postal_pin: 6-digit postal PIN
- name: customer personal name

Transcript to analyze:
"${sanitizedText}"

Context:
${context || 'Customer support call'}

Rules:
1. Only extract entities explicitly mentioned in the text.
2. DO NOT extract masked sensitive items (card numbers, OTPs, Aadhaar, PAN).
3. If uncertain, assign confidence < 0.7.
`;

    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: 'The entity type: name, mobile, email, imei, serial, order_id, postal_pin',
              },
              value: {
                type: Type.STRING,
                description: 'The extracted identifier value',
              },
              quote: {
                type: Type.STRING,
                description: 'The exact quote or phrase from the transcript',
              },
              confidence: {
                type: Type.NUMBER,
                description: 'Confidence between 0 and 1',
              },
            },
            required: ['type', 'value', 'quote', 'confidence'],
          },
        },
      },
    });

    const rawJson = response.text?.trim() || '[]';
    const parsed = JSON.parse(rawJson) as Array<{
      type: string;
      value: string;
      quote: string;
      confidence: number;
    }>;

    const validated: ExtractedEntityRaw[] = [];

    for (const item of parsed) {
      const type = item.type as EntityType;
      // MANDATORY: Deterministic validation gate
      const valResult = validateFieldCandidate(type, item.value);
      if (valResult.valid) {
        validated.push({
          type,
          value: valResult.normalizedCandidate || item.value,
          quote: item.quote,
          confidence: Math.min(1, Math.max(0, item.confidence || 0.8)),
        });
      }
    }

    return validated;
  } catch (err) {
    console.warn('[GeminiClient] Entity extraction error, falling back to deterministic only:', err);
    return [];
  }
}

/**
 * Generates structured call notes using Gemini with strict schema adherence
 * Follows section 12 specification.
 */
export async function generateCallNotesWithGemini(params: {
  callId: string;
  segments: Segment[];
  candidates: Candidate[];
  isFinal: boolean;
  version: number;
}): Promise<CallNotes> {
  const { callId, segments, candidates, isFinal, version } = params;

  // Format candidate list with status (unconfirmed clearly labeled)
  const candidateDetails: CallNotesDetail[] = candidates
    .filter((c) => c.status !== 'dismissed' && c.status !== 'superseded')
    .map((c) => {
      const statusLabel = c.status === 'confirmed' ? '' : ' (unconfirmed)';
      return {
        candidateId: c.id,
        label: `${c.type}${statusLabel}`,
        value: c.displayValue || c.value,
      };
    });

  // Prepare sanitized transcript text
  const transcriptLines = segments.map((s) => {
    const { sanitizedText } = scanSensitiveData(s.text);
    return `[${s.speaker.toUpperCase()} @ ${Math.round(s.startMs / 1000)}s]: ${sanitizedText}`;
  });

  const fullTranscript = transcriptLines.join('\n');

  if (process.env.NODE_ENV === 'test' || !aiClient || segments.length === 0) {
    // Deterministic fallback notes generator
    return generateFallbackNotes({
      callId,
      segments,
      candidates,
      isFinal,
      version,
      details: candidateDetails,
    });
  }

  try {
    const prompt = `You are Yani, a silent call spectator assistant creating call notes for a support agent.
Analyze the following live support call transcript and captured details.

TRANSCRIPT:
${fullTranscript}

CAPTURED DETAILS:
${candidateDetails.map((d) => `- ${d.label}: ${d.value}`).join('\n') || 'None yet'}

NON-NEGOTIABLE RULES (SECTION 12):
1. Use ONLY what is explicitly stated in the transcript. Do NOT invent facts, customer names, numbers, or promises.
2. Attribute actions/commitments to the right speaker (e.g., "Agent will send replacement by Friday", "Customer will upload serial photo").
3. Keep the summary concise (3 to 5 sentences).
4. Never include sensitive data (card numbers, PINs, OTPs).
5. If something is unclear or ambiguous, place it under "openItems" instead of guessing.
6. Provide short bullet points for actions promised, follow-ups, and open items.
`;

    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: '3-5 sentence factual overview of the conversation',
            },
            issue: {
              type: Type.STRING,
              description: 'The customer primary issue or request stated on the call',
            },
            actions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Action items promised during the call with speaker attribution',
            },
            followUps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Follow-up items for next steps',
            },
            openItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Unresolved or unclear questions requiring customer clarification',
            },
          },
          required: ['summary', 'issue', 'actions', 'followUps', 'openItems'],
        },
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');

    return {
      callId,
      version,
      final: isFinal,
      summary: parsed.summary || 'Call in progress. Listening for customer issue and details.',
      issue: parsed.issue || 'Customer support inquiry.',
      details: candidateDetails,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      openItems: Array.isArray(parsed.openItems) ? parsed.openItems : [],
      generatedAt: new Date().toISOString(),
      model: GEMINI_MODEL,
    };
  } catch (err) {
    console.warn('[GeminiClient] Notes generation error, falling back to deterministic template:', err);
    return generateFallbackNotes({
      callId,
      segments,
      candidates,
      isFinal,
      version,
      details: candidateDetails,
    });
  }
}

function generateFallbackNotes(params: {
  callId: string;
  segments: Segment[];
  candidates: Candidate[];
  isFinal: boolean;
  version: number;
  details: CallNotesDetail[];
}): CallNotes {
  const { callId, segments, candidates, isFinal, version, details } = params;

  const agentSegments = segments.filter((s) => s.speaker === 'agent');
  const customerSegments = segments.filter((s) => s.speaker === 'customer');

  const customerTopics = customerSegments.map((s) => s.text).join(' ');
  const issueSnippet =
    customerSegments.length > 0
      ? customerSegments[0].text.slice(0, 120)
      : 'Inquiry ongoing.';

  const summary = `Support call session with ${segments.length} turn(s). The customer shared ${
    details.length
  } key detail(s). ${isFinal ? 'Call completed.' : 'Call in progress.'}`;

  return {
    callId,
    version,
    final: isFinal,
    summary,
    issue: issueSnippet,
    details,
    actions: [
      `Review ${details.length} captured detail(s) before closing ticket.`,
    ],
    followUps: isFinal ? ['Send confirmation summary to customer.'] : ['Awaiting call wrap-up.'],
    openItems:
      candidates.some((c) => c.status === 'needs_review' || c.status === 'detected')
        ? ['Verify unconfirmed candidate fields with customer.']
        : [],
    generatedAt: new Date().toISOString(),
    model: 'Deterministic Notes Engine (Fallback)',
  };
}
