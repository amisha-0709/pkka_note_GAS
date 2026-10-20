import { Router } from 'express';
import type { FieldType, LanguageCode } from '../../types/index.ts';
import { callGnaniTimbreTTS } from '../services/gnaniTimbre.ts';
import { formatReadBackText, validateFieldCandidate } from '../../lib/fieldEngine.ts';
import { auditDb } from '../persistence/database.ts';
import { createStateEvent } from '../../lib/confirmationStateMachine.ts';

export const readbackRouter = Router();

readbackRouter.post('/api/readback', async (req, res) => {
  try {
    const { candidate, field, language, sessionId, captureId, attempt = 1 } = req.body;

    if (!sessionId || !captureId || !candidate) {
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_PARAMETERS',
        message: 'sessionId, captureId, and candidate are all strictly required for read-back synthesis.',
      });
    }

    const capture = auditDb.getCapture(captureId);
    if (!capture) {
      return res.status(404).json({
        success: false,
        errorCode: 'NONEXISTENT_CAPTURE',
        message: `Capture record "${captureId}" does not exist in audit database.`,
      });
    }

    if (capture.sessionId !== sessionId) {
      return res.status(400).json({
        success: false,
        errorCode: 'CAPTURE_SESSION_MISMATCH',
        message: `Capture "${captureId}" belongs to session "${capture.sessionId}", not "${sessionId}".`,
      });
    }

    if (capture.normalizedCandidate !== candidate) {
      return res.status(409).json({
        success: false,
        errorCode: 'STALE_CANDIDATE',
        message: `Submitted candidate "${candidate}" does not match active capture candidate "${capture.normalizedCandidate}".`,
      });
    }

    const fieldType = (field || capture.field || 'mobile_number') as FieldType;
    const langCode = (language || 'en-IN') as LanguageCode;

    // Validate field candidate format
    const validation = validateFieldCandidate(fieldType, candidate);
    if (!validation.valid || capture.validityStatus !== 'valid_candidate') {
      return res.status(422).json({
        success: false,
        errorCode: 'INVALID_CANDIDATE',
        message: `Candidate "${candidate}" is invalid (${validation.validationMessage}) and cannot be read back.`,
      });
    }

    // Format read-back text for maximum phonetic clarity
    const spokenText = formatReadBackText(candidate, fieldType);

    const ttsResult = await callGnaniTimbreTTS({
      text: spokenText,
      languageCode: langCode,
    });

    if (!ttsResult.success) {
      if (sessionId) {
        try {
          await auditDb.insertEvent(
            createStateEvent(sessionId, 'valid_candidate', 'failed', attempt, captureId, undefined, {
              candidate,
              error: ttsResult.errorMessage,
              errorCode: ttsResult.errorCode,
              spokenText,
            })
          );
        } catch (dbErr) {
          console.error('[ReadBack] Failed to record failure event:', dbErr);
        }
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
      try {
        await auditDb.insertEvent(
          createStateEvent(sessionId, 'valid_candidate', 'read_back', attempt, captureId, undefined, {
            candidate,
            spokenText,
            model: ttsResult.model,
            voice: ttsResult.voice,
            latencyMs: ttsResult.latencyMs,
          })
        );
        await auditDb.updateSessionStatus(sessionId, 'read_back');
      } catch (dbErr) {
        console.error('[ReadBack] Failed to record read-back event:', dbErr);
        return res.status(500).json({
          success: false,
          errorCode: 'AUDIT_PERSISTENCE_FAILED',
          message: 'Audio synthesized successfully but audit event persistence failed.',
        });
      }
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
  } catch (err) {
    console.error('[ReadBack] Unhandled error:', err);
    res.status(500).json({
      success: false,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred during readback.',
    });
  }
});
