import { Router } from 'express';
import type { FieldType, LanguageCode } from '../../types/index.ts';
import { callGnaniTimbreTTS } from '../services/gnaniTimbre.ts';
import { formatReadBackText } from '../../lib/fieldEngine.ts';
import { auditDb } from '../persistence/database.ts';
import { createStateEvent } from '../../lib/confirmationStateMachine.ts';

export const readbackRouter = Router();

readbackRouter.post('/api/readback', async (req, res) => {
  const { candidate, field, language, sessionId, captureId, attempt = 1 } = req.body;

  if (!candidate) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_CANDIDATE',
      message: 'No candidate value provided for read-back synthesis.',
    });
  }

  const fieldType = (field || 'mobile_number') as FieldType;
  const langCode = (language || 'en-IN') as LanguageCode;

  // Format read-back text for maximum phonetic clarity
  const spokenText = formatReadBackText(candidate, fieldType);

  const ttsResult = await callGnaniTimbreTTS({
    text: spokenText,
    languageCode: langCode,
  });

  if (!ttsResult.success) {
    if (sessionId) {
      auditDb.insertEvent(
        createStateEvent(sessionId, 'valid_candidate', 'failed', attempt, captureId, undefined, {
          candidate,
          error: ttsResult.errorMessage,
          errorCode: ttsResult.errorCode,
          spokenText,
        })
      );
    }

    const statusCode = ttsResult.errorCode === 'GNANI_API_KEY_NOT_CONFIGURED' ? 503 : 502;
    return res.status(statusCode).json({
      success: false,
      spokenText,
      errorCode: ttsResult.errorCode,
      message: ttsResult.errorMessage,
      latencyMs: ttsResult.latencyMs,
    });
  }

  if (sessionId) {
    auditDb.insertEvent(
      createStateEvent(sessionId, 'valid_candidate', 'read_back', attempt, captureId, undefined, {
        candidate,
        spokenText,
        model: ttsResult.model,
        voice: ttsResult.voice,
        latencyMs: ttsResult.latencyMs,
      })
    );
  }

  res.status(200).json({
    success: true,
    spokenText,
    audioBase64: ttsResult.audioBase64,
    audioMimeType: ttsResult.audioMimeType,
    latencyMs: ttsResult.latencyMs,
    model: ttsResult.model,
    voice: ttsResult.voice,
  });
});
