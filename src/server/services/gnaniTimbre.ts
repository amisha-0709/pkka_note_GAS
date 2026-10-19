/**
 * Pakka Note - Gnani Timbre TTS Integration Service
 * Communicates with Gnani Timbre TTS inference endpoint (Timbre v2.5 / Nalini).
 * Server-side credential handling with audio streaming & base64 conversion.
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

export async function callGnaniTimbreTTS(req: TimbreTTSRequest): Promise<TimbreTTSResponse> {
  const config = getServerConfig();
  const startTime = Date.now();
  const model = req.model || config.ttsModel;
  const voice = req.voice || config.ttsVoice;

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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const payload = {
      text: req.text,
      input_text: req.text,
      language: req.languageCode,
      language_code: req.languageCode,
      model,
      voice,
      audio_format: 'wav',
    };

    const response = await fetch(config.ttsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-ID': config.gnaniApiKey,
      },
      body: JSON.stringify(payload),
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
        audioMimeType: 'audio/wav',
        latencyMs,
        model,
        voice,
        spokenText: req.text,
        errorCode,
        errorMessage: `Gnani Timbre TTS returned HTTP ${response.status}: ${errBody.substring(0, 200)}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    
    // If response is raw binary audio
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = buffer.toString('base64');
      const mime = contentType.includes('mp3') ? 'audio/mp3' : 'audio/wav';

      return {
        success: true,
        audioBase64,
        audioMimeType: mime,
        latencyMs,
        model,
        voice,
        spokenText: req.text,
      };
    }

    // Otherwise JSON containing base64 audio
    const json = await response.json();
    let audioBase64 = '';
    let mime = 'audio/wav';

    if (json.audio_content) {
      audioBase64 = json.audio_content;
    } else if (json.data?.audio) {
      audioBase64 = json.data.audio;
    } else if (json.audio) {
      audioBase64 = json.audio;
    } else if (json.result?.audio) {
      audioBase64 = json.result.audio;
    }

    // Strip data URI prefix if present
    if (audioBase64.includes('base64,')) {
      const parts = audioBase64.split('base64,');
      audioBase64 = parts[1];
      if (parts[0].includes('mp3')) mime = 'audio/mp3';
    }

    if (!audioBase64) {
      return {
        success: false,
        audioMimeType: 'audio/wav',
        latencyMs,
        model,
        voice,
        spokenText: req.text,
        errorCode: 'EMPTY_AUDIO_RESPONSE',
        errorMessage: 'Gnani Timbre returned HTTP 200 but no audio_content was found in the JSON response.',
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
  }
}
