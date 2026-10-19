import { Router } from 'express';
import { getServerConfig } from '../config/environment.ts';
import { callGnaniTimbreTTS } from '../services/gnaniTimbre.ts';

export const testConnectionRouter = Router();

testConnectionRouter.post('/api/test-connection', async (req, res) => {
  const config = getServerConfig();

  if (!config.isGnaniConfigured) {
    return res.status(400).json({
      success: false,
      errorCode: 'GNANI_API_KEY_NOT_CONFIGURED',
      message:
        'Cannot test connection: GNANI_API_KEY is not configured in environment or Secrets panel.',
    });
  }

  const result = await callGnaniTimbreTTS({
    text: 'Pakka Note integration check.',
    languageCode: 'en-IN',
  });

  if (!result.success) {
    return res.status(200).json({
      success: false,
      errorCode: result.errorCode,
      message: result.errorMessage,
      latencyMs: result.latencyMs,
    });
  }

  res.json({
    success: true,
    message: 'Gnani API connectivity verified successfully.',
    latencyMs: result.latencyMs,
    model: result.model,
    voice: result.voice,
  });
});
