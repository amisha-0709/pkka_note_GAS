/**
 * Pakka Note - Gnani Prisma STT Integration Service
 * Communicates with Gnani Prisma Speech-to-Text API v3.
 * Strictly adheres to server-side secrets discipline and transparent error reporting.
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

export async function callGnaniPrismaSTT(req: PrismaSTTRequest): Promise<PrismaSTTResponse> {
  const config = getServerConfig();
  const startTime = Date.now();
  const mode = req.format || 'transcribe';
  const modelName = 'Gnani Prisma v3';

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

  try {
    const boundary = `----PakkaNoteBoundary${Date.now()}`;
    const filename = req.originalFilename || 'audio.wav';
    
    // Construct standard multipart/form-data payload with Node Buffer/Blob
    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(req.audioBuffer)], { type: req.mimeType || 'audio/wav' });
    
    formData.append('audio_file', audioBlob, filename);
    formData.append('language_code', req.languageCode);
    formData.append('preferred_language', req.preferredLanguage || req.languageCode);
    formData.append('format', mode);
    formData.append('itn_native_numerals', String(req.itnNativeNumerals ?? true));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second bounded timeout

    const response = await fetch(config.sttEndpoint, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': config.gnaniApiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        errBody = response.statusText;
      }

      // Safe error categorization
      let errorCode = `HTTP_${response.status}`;
      if (response.status === 401 || response.status === 403) {
        errorCode = 'GNANI_AUTH_FAILED';
      } else if (response.status === 429) {
        errorCode = 'GNANI_RATE_LIMITED';
      } else if (response.status >= 500) {
        errorCode = 'GNANI_UPSTREAM_ERROR';
      }

      return {
        success: false,
        transcript: '',
        latencyMs,
        model: modelName,
        mode,
        errorCode,
        errorMessage: `Gnani STT returned HTTP ${response.status}: ${errBody.substring(0, 200)}`,
      };
    }

    const json = await response.json();
    
    // Parse transcript from possible Gnani Prisma JSON response shapes
    let transcript = '';
    if (typeof json === 'string') {
      transcript = json;
    } else if (json.transcript) {
      transcript = json.transcript;
    } else if (json.text) {
      transcript = json.text;
    } else if (json.data?.transcript) {
      transcript = json.data.transcript;
    } else if (json.result?.transcript) {
      transcript = json.result.transcript;
    } else if (Array.isArray(json.result) && json.result[0]?.transcript) {
      transcript = json.result[0].transcript;
    } else if (Array.isArray(json) && json[0]?.transcript) {
      transcript = json[0].transcript;
    }

    return {
      success: true,
      transcript: (transcript || '').trim(),
      latencyMs,
      model: modelName,
      mode,
      rawResponseSummary: JSON.stringify(json).substring(0, 300),
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
  }
}
