/**
 * Pakka Note - Gnani Timbre TTS Integration Service
 * Communicates with Gnani Timbre TTS inference endpoint (Timbre v2.5 / Nalini).
 * Sends canonical JSON request payload without duplicate aliases,
 * validates audio response integrity, detects MIME types accurately,
 * and cleans up timeouts safely.
 */

import { getServerConfig } from '../config/environment.ts';
import type { LanguageCode } from '../../types/index.ts';

export interface TimbreTTSRequest {
  text: string;
  languageCode: LanguageCode;
  model?: string;
  voice?: string;
}

export interface TimbreTTSResponse {
  success: boolean;
  audioBase64?: string;
  audioMimeType: string;
  latencyMs: number;
  model: string;
  voice: string;
  spokenText: string;
  errorCode?: string;
  errorMessage?: string;
}

const SUPPORTED_LANGUAGES: LanguageCode[] = ['en-IN', 'hi-IN'];

/**
 * Detects whether an audio buffer is WAV (starts with 'RIFF') or MP3
 */
function detectAudioMimeType(buffer: Buffer): string {
  if (buffer.length >= 4) {
    const magic = buffer.toString('utf-8', 0, 4);
    if (magic === 'RIFF') {
      return 'audio/wav';
    }
    if (magic.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return 'audio/mp3';
    }
  }
  return 'audio/wav';
}

export async function callGnaniTimbreTTS(req: TimbreTTSRequest): Promise<TimbreTTSResponse> {
  const config = getServerConfig();
  const startTime = Date.now();
  const model = (req.model || config.ttsModel).trim();
  const voice = (req.voice || config.ttsVoice).trim();

  // 1. Validate inputs
  if (!req.text || !req.text.trim()) {
    return {
      success: false,
      audioMimeType: 'audio/wav',
      latencyMs: Date.now() - startTime,
      model,
      voice,
      spokenText: '',
      errorCode: 'EMPTY_TEXT_INPUT',
      errorMessage: 'Input text to synthesize is empty.',
    };
  }

  if (req.text.length > 20000) {
    return {
      success: false,
      audioMimeType: 'audio/wav',
      latencyMs: Date.now() - startTime,
      model,
      voice,
      spokenText: req.text.slice(0, 50),
      errorCode: 'TEXT_TOO_LONG',
      errorMessage: 'Input text exceeds the maximum 20,000 character limit for TTS synthesis.',
    };
  }

  if (!SUPPORTED_LANGUAGES.includes(req.languageCode)) {
    return {
      success: false,
      audioMimeType: 'audio/wav',
      latencyMs: Date.now() - startTime,
      model,
      voice,
      spokenText: req.text,
      errorCode: 'UNSUPPORTED_LANGUAGE',
      errorMessage: `Language code "${req.languageCode}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(', ')}.`,
    };
  }

  // 2. Validate configuration
  if (!config.isGnaniConfigured) {
    return {
      success: false,
      audioMimeType: 'audio/wav',
      latencyMs: Date.now() - startTime,
      model,
      voice,
      spokenText: req.text,
      errorCode: 'GNANI_API_KEY_NOT_CONFIGURED',
      errorMessage:
        'Gnani API key is not configured in Google AI Studio Secrets. Please set GNANI_API_KEY in the Secrets panel.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second bounded timeout

  try {
    // Canonical Gnani Timbre REST inference payload - strictly required fields, no duplicate aliases
    const payload: Record<string, string> = {
      text: req.text.trim(),
      language: req.languageCode,
      voice: voice || 'Nalini',
      audio_format: 'wav',
    };

    if (model) {
      payload.model = model;
    }

    const response = await fetch(config.ttsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-ID': config.gnaniApiKey,
      },
      body: JSON.stringify(payload),
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

      let errorCode = `HTTP_${response.status}`;
      if (response.status === 401 || response.status === 403) {
        errorCode = 'GNANI_AUTH_FAILED';
      } else if (response.status === 429) {
        errorCode = 'GNANI_RATE_LIMITED';
      } else if (response.status >= 500) {
        errorCode = 'GNANI_UPSTREAM_ERROR';
      }

      let sanitizedBody = errBody;
      if (config.gnaniApiKey) {
        sanitizedBody = sanitizedBody.split(config.gnaniApiKey).join('[REDACTED]');
      }
      sanitizedBody = sanitizedBody.replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]').slice(0, 200);

      return {
        success: false,
        audioMimeType: 'audio/wav',
        latencyMs,
        model,
        voice,
        spokenText: req.text,
        errorCode,
        errorMessage: `Gnani Timbre TTS returned HTTP ${response.status}: ${sanitizedBody}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle binary stream response
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 44) {
        return {
          success: false,
          audioMimeType: 'audio/wav',
          latencyMs,
          model,
          voice,
          spokenText: req.text,
          errorCode: 'AUDIO_TRUNCATED',
          errorMessage: `Gnani Timbre returned truncated audio payload (${buffer.length} bytes).`,
        };
      }

      const detectedMime = detectAudioMimeType(buffer);
      const audioBase64 = buffer.toString('base64');

      return {
        success: true,
        audioBase64,
        audioMimeType: detectedMime,
        latencyMs,
        model,
        voice,
        spokenText: req.text,
      };
    }

    // Handle JSON response
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        success: false,
        audioMimeType: 'audio/wav',
        latencyMs,
        model,
        voice,
        spokenText: req.text,
        errorCode: 'INVALID_JSON_RESPONSE',
        errorMessage:
          'Gnani Timbre returned HTTP 200 but body was neither valid audio nor valid JSON.',
      };
    }

    let audioBase64 = '';
    let mime = 'audio/wav';

    if (json && typeof json === 'object') {
      const rec = json as Record<string, unknown>;
      if (typeof rec.audio_content === 'string') {
        audioBase64 = rec.audio_content;
      } else if (typeof rec.audio === 'string') {
        audioBase64 = rec.audio;
      } else if (
        rec.data &&
        typeof rec.data === 'object' &&
        typeof (rec.data as Record<string, unknown>).audio === 'string'
      ) {
        audioBase64 = (rec.data as Record<string, unknown>).audio as string;
      } else if (
        rec.result &&
        typeof rec.result === 'object' &&
        typeof (rec.result as Record<string, unknown>).audio === 'string'
      ) {
        audioBase64 = (rec.result as Record<string, unknown>).audio as string;
      }
    }

    // Clean data URI prefix if returned by provider
    if (audioBase64.includes('base64,')) {
      const parts = audioBase64.split('base64,');
      audioBase64 = parts[1];
      if (parts[0].includes('mp3')) mime = 'audio/mp3';
    }

    if (!audioBase64 || audioBase64.length < 64) {
      return {
        success: false,
        audioMimeType: 'audio/wav',
        latencyMs,
        model,
        voice,
        spokenText: req.text,
        errorCode: 'EMPTY_AUDIO_RESPONSE',
        errorMessage:
          'Gnani Timbre returned HTTP 200 but no valid audio content was found in the response.',
      };
    }

    return {
      success: true,
      audioBase64,
      audioMimeType: mime,
      latencyMs,
      model,
      voice,
      spokenText: req.text,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const isAbort = err instanceof Error && err.name === 'AbortError';

    return {
      success: false,
      audioMimeType: 'audio/wav',
      latencyMs,
      model,
      voice,
      spokenText: req.text,
      errorCode: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      errorMessage: isAbort
        ? 'Gnani Timbre TTS request timed out after 15 seconds.'
        : `Network error connecting to Gnani Timbre TTS: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
