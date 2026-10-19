/**
 * Pakka Note - Gnani Prisma STT Integration Service
 * Communicates with Gnani Prisma Speech-to-Text API v3.
 * Strictly adheres to server-side secrets discipline, response validation,
 * and transparent error reporting without faking success on empty transcripts.
 */

import { getServerConfig } from '../config/environment.ts';
import type { LanguageCode, STTFormatMode } from '../../types/index.ts';

export interface PrismaSTTRequest {
  audioBuffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  languageCode: LanguageCode;
  preferredLanguage?: LanguageCode;
  format?: STTFormatMode;
  itnNativeNumerals?: boolean;
}

export interface PrismaSTTResponse {
  success: boolean;
  transcript: string;
  latencyMs: number;
  model: string;
  mode: STTFormatMode;
  errorCode?: string;
  errorMessage?: string;
  rawResponseSummary?: string;
}

const SUPPORTED_LANGUAGES: LanguageCode[] = ['en-IN', 'hi-IN'];
const SUPPORTED_MODES: STTFormatMode[] = ['transcribe', 'verbatim'];

export async function callGnaniPrismaSTT(req: PrismaSTTRequest): Promise<PrismaSTTResponse> {
  const config = getServerConfig();
  const startTime = Date.now();
  const mode = req.format || 'transcribe';
  const modelName = 'Gnani Prisma v3';

  // 1. Validate inputs
  if (!req.audioBuffer || req.audioBuffer.length === 0) {
    return {
      success: false,
      transcript: '',
      latencyMs: Date.now() - startTime,
      model: modelName,
      mode,
      errorCode: 'EMPTY_AUDIO_INPUT',
      errorMessage: 'Audio input buffer is empty. A valid non-empty audio recording is required.',
    };
  }

  if (!SUPPORTED_LANGUAGES.includes(req.languageCode)) {
    return {
      success: false,
      transcript: '',
      latencyMs: Date.now() - startTime,
      model: modelName,
      mode,
      errorCode: 'UNSUPPORTED_LANGUAGE',
      errorMessage: `Language code "${req.languageCode}" is not supported. Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}.`,
    };
  }

  if (!SUPPORTED_MODES.includes(mode)) {
    return {
      success: false,
      transcript: '',
      latencyMs: Date.now() - startTime,
      model: modelName,
      mode,
      errorCode: 'UNSUPPORTED_MODE',
      errorMessage: `Format mode "${mode}" is not supported. Supported modes: ${SUPPORTED_MODES.join(', ')}.`,
    };
  }

  // 2. Validate configuration
  if (!config.isGnaniConfigured) {
    return {
      success: false,
      transcript: '',
      latencyMs: Date.now() - startTime,
      model: modelName,
      mode,
      errorCode: 'GNANI_API_KEY_NOT_CONFIGURED',
      errorMessage:
        'Gnani API key is not configured in Google AI Studio Secrets. Please set GNANI_API_KEY in the Secrets panel.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second bounded timeout

  try {
    const filename = req.originalFilename || 'audio.wav';

    // Construct standard multipart/form-data payload with Node Buffer/Blob
    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(req.audioBuffer)], {
      type: req.mimeType || 'audio/wav',
    });

    formData.append('audio_file', audioBlob, filename);
    formData.append('language_code', req.languageCode);
    formData.append('preferred_language', req.preferredLanguage || req.languageCode);
    formData.append('format', mode);
    formData.append('itn_native_numerals', String(req.itnNativeNumerals ?? true));

    const response = await fetch(config.sttEndpoint, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': config.gnaniApiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        errBody = response.statusText;
      }

      // Safe error categorization without exposing secrets
      let errorCode = `HTTP_${response.status}`;
      if (response.status === 401 || response.status === 403) {
        errorCode = 'GNANI_AUTH_FAILED';
      } else if (response.status === 429) {
        errorCode = 'GNANI_RATE_LIMITED';
      } else if (response.status >= 500) {
        errorCode = 'GNANI_UPSTREAM_ERROR';
      }

      // Sanitize any accidental secret leakage in provider error response
      let sanitizedBody = errBody;
      if (config.gnaniApiKey) {
        sanitizedBody = sanitizedBody.split(config.gnaniApiKey).join('[REDACTED]');
      }
      sanitizedBody = sanitizedBody.replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]').slice(0, 200);

      return {
        success: false,
        transcript: '',
        latencyMs,
        model: modelName,
        mode,
        errorCode,
        errorMessage: `Gnani STT returned HTTP ${response.status}: ${sanitizedBody}`,
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        success: false,
        transcript: '',
        latencyMs,
        model: modelName,
        mode,
        errorCode: 'INVALID_JSON_RESPONSE',
        errorMessage: 'Gnani Prisma returned HTTP 200 but response body was not valid JSON.',
      };
    }

    // Parse transcript from possible Gnani Prisma JSON response shapes
    let extractedTranscript = '';
    if (typeof json === 'string') {
      extractedTranscript = json;
    } else if (json && typeof json === 'object') {
      const rec = json as Record<string, unknown>;
      if (typeof rec.transcript === 'string') {
        extractedTranscript = rec.transcript;
      } else if (typeof rec.text === 'string') {
        extractedTranscript = rec.text;
      } else if (
        rec.data &&
        typeof rec.data === 'object' &&
        typeof (rec.data as Record<string, unknown>).transcript === 'string'
      ) {
        extractedTranscript = (rec.data as Record<string, unknown>).transcript as string;
      } else if (rec.result && typeof rec.result === 'object') {
        const resObj = rec.result as Record<string, unknown>;
        if (typeof resObj.transcript === 'string') {
          extractedTranscript = resObj.transcript;
        } else if (
          Array.isArray(rec.result) &&
          rec.result[0] &&
          typeof rec.result[0].transcript === 'string'
        ) {
          extractedTranscript = rec.result[0].transcript;
        }
      } else if (Array.isArray(json) && json[0] && typeof json[0].transcript === 'string') {
        extractedTranscript = json[0].transcript;
      }
    }

    const cleanedTranscript = (extractedTranscript || '').trim();

    // Critical Requirement: A 2xx response with a missing, unrecognized, or empty transcript MUST return failure, NOT success!
    if (!cleanedTranscript) {
      return {
        success: false,
        transcript: '',
        latencyMs,
        model: modelName,
        mode,
        errorCode: 'EMPTY_OR_UNRECOGNIZED_TRANSCRIPT',
        errorMessage:
          'Gnani Prisma returned a response without a valid or non-empty speech transcript.',
        rawResponseSummary: JSON.stringify(json).slice(0, 300),
      };
    }

    return {
      success: true,
      transcript: cleanedTranscript,
      latencyMs,
      model: modelName,
      mode,
      rawResponseSummary: JSON.stringify(json).slice(0, 300),
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const isAbort = err instanceof Error && err.name === 'AbortError';

    return {
      success: false,
      transcript: '',
      latencyMs,
      model: modelName,
      mode,
      errorCode: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      errorMessage: isAbort
        ? 'Gnani Prisma STT request timed out after 15 seconds.'
        : `Network error connecting to Gnani STT: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
