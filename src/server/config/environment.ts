/**
 * Pakka Note - Server Environment & Safe Secrets Handling
 * Ensures API keys are read server-side only and never logged or leaked.
 */

export interface ServerConfig {
  gnaniApiKey: string;
  isGnaniConfigured: boolean;
  sttEndpoint: string;
  ttsEndpoint: string;
  defaultLang: string;
  sttFormat: string;
  ttsModel: string;
  ttsVoice: string;
  port: number;
}

export function getServerConfig(): ServerConfig {
  const apiKey = (process.env.GNANI_API_KEY || '').trim();
  const isConfigured = apiKey.length > 0;

  return {
    gnaniApiKey: apiKey,
    isGnaniConfigured: isConfigured,
    sttEndpoint: (process.env.GNANI_STT_URL || 'https://api.vachana.ai/stt/v3').trim(),
    ttsEndpoint: (process.env.GNANI_TTS_URL || 'https://api.vachana.ai/api/v1/tts/inference').trim(),
    defaultLang: (process.env.GNANI_STT_DEFAULT_LANG || 'en-IN').trim(),
    sttFormat: (process.env.GNANI_STT_FORMAT || 'transcribe').trim(),
    ttsModel: (process.env.GNANI_TTS_MODEL || 'timbre-v2.5').trim(),
    ttsVoice: (process.env.GNANI_TTS_VOICE || 'Nalini').trim(),
    port: parseInt(process.env.PORT || '3000', 10),
  };
}

/**
 * Returns a safely masked version of the API key for system diagnostics
 * e.g., "gnani_***...48a2" or "Not Configured"
 */
export function getMaskedApiKey(): string {
  const apiKey = (process.env.GNANI_API_KEY || '').trim();
  if (!apiKey) return 'Not Configured';
  if (apiKey.length <= 8) return '********';
  const prefix = apiKey.substring(0, 4);
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}***...${suffix}`;
}
