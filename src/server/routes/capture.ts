import { Router } from 'express';
import multer from 'multer';
import type { FieldType, LanguageCode, STTFormatMode, CaptureRecord } from '../../types/index.ts';
import { callGnaniPrismaSTT } from '../services/gnaniPrisma.ts';
import { validateFieldCandidate } from '../../lib/fieldEngine.ts';
import { auditDb } from '../persistence/database.ts';
import { createStateEvent } from '../../lib/confirmationStateMachine.ts';

export const captureRouter = Router();

// Store audio in memory with 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

captureRouter.post('/api/capture', upload.single('audio'), async (req, res) => {
  try {
    const startTime = Date.now();
    const file = req.file;

    const field = (req.body.field || 'mobile_number') as FieldType;
    const language = (req.body.language || 'en-IN') as LanguageCode;
    const mode = (req.body.format || 'transcribe') as STTFormatMode;
    const sessionId =
      req.body.sessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const attempt = parseInt(req.body.attempt || '1', 10);
    const isSimulated =
      req.body.isSimulatedFixture === 'true' || req.body.isSimulatedFixture === true;
    const simulatedTranscript = req.body.simulatedTranscript;

    // Validate or initialize session
    await auditDb.createOrGetSession(sessionId, field, language);

    const captureId = `cap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Audit state: CAPTURED
    await auditDb.insertEvent(
      createStateEvent(sessionId, 'idle', 'captured', attempt, captureId, undefined, {
        field,
        language,
        mode,
        audioSize: file?.size || 0,
        mimeType: file?.mimetype || 'unknown',
      })
    );

    let transcript = '';
    let latencyMs = 0;
    let modelName = 'Gnani Prisma v3';
    let errorCategory: string | undefined;

    if (isSimulated && simulatedTranscript !== undefined) {
      // Offline / synthetic regression fixture path
      transcript = String(simulatedTranscript).trim();
      latencyMs = Date.now() - startTime;
      modelName = 'Prisma v3 (Simulated Regression Fixture)';
    } else {
      // Live audio path
      if (!file || !file.buffer || file.size === 0) {
        return res.status(400).json({
          success: false,
          errorCode: 'EMPTY_AUDIO',
          message: 'No valid audio data was provided. Please record or upload an audio clip.',
        });
      }

      const sttResult = await callGnaniPrismaSTT({
        audioBuffer: file.buffer,
        mimeType: file.mimetype || 'audio/wav',
        originalFilename: file.originalname || 'speech.wav',
        languageCode: language,
        preferredLanguage: language,
        format: mode,
        itnNativeNumerals: true,
      });

      latencyMs = sttResult.latencyMs;
      modelName = sttResult.model;

      if (!sttResult.success) {
        errorCategory = sttResult.errorCode || 'STT_FAILED';
        const failedCapture: CaptureRecord = {
          captureId,
          sessionId,
          attempt,
          timestamp: new Date().toISOString(),
          field,
          language,
          model: modelName,
          modelVersion: 'v3',
          mode,
          audioFormat: file.mimetype || 'audio/wav',
          rawTranscript: '',
          normalizedCandidate: '',
          validityStatus: 'uncertain',
          validationMessage: sttResult.errorMessage || 'STT failed to transcribe audio.',
          attempts: attempt,
          latencyMs,
          errorCategory,
        };

        try {
          await auditDb.insertCapture(failedCapture);
          await auditDb.insertEvent(
            createStateEvent(sessionId, 'captured', 'failed', attempt, captureId, undefined, {
              error: sttResult.errorMessage,
              errorCode: sttResult.errorCode,
            })
          );
        } catch (dbErr) {
          console.error('[Capture] Persistence error on STT failure:', dbErr);
        }

        const statusCode =
          sttResult.errorCode === 'GNANI_API_KEY_NOT_CONFIGURED' ? 503 : 502;
        return res.status(statusCode).json({
          success: false,
          captureId,
          sessionId,
          errorCode: sttResult.errorCode,
          message: sttResult.errorMessage,
          latencyMs,
        });
      }

      transcript = sttResult.transcript;
    }

    // Audit state: TRANSCRIBED
    await auditDb.insertEvent(
      createStateEvent(sessionId, 'captured', 'transcribed', attempt, captureId, undefined, {
        rawTranscriptLength: transcript.length,
        latencyMs,
      })
    );

    // Field Engine normalization and validation
    const validation = validateFieldCandidate(field, transcript);

    const captureRecord: CaptureRecord = {
      captureId,
      sessionId,
      attempt,
      timestamp: new Date().toISOString(),
      field,
      language,
      model: modelName,
      modelVersion: 'v3',
      mode,
      audioFormat: file?.mimetype || 'audio/wav',
      rawTranscript: transcript,
      normalizedCandidate: validation.normalizedCandidate,
      validityStatus: validation.status,
      validationMessage: validation.validationMessage,
      attempts: attempt,
      latencyMs,
    };

    await auditDb.insertCapture(captureRecord);

    // Audit state: VALID_CANDIDATE or INVALID_CANDIDATE
    const nextState = validation.valid ? 'valid_candidate' : validation.status;
    await auditDb.insertEvent(
      createStateEvent(sessionId, 'transcribed', nextState, attempt, captureId, undefined, {
        candidate: validation.normalizedCandidate,
        valid: validation.valid,
        validationMessage: validation.validationMessage,
      })
    );

    res.json({
      success: true,
      captureId,
      sessionId,
      field,
      language,
      rawTranscript: transcript,
      candidate: validation.normalizedCandidate,
      valid: validation.valid,
      validationMessage: validation.validationMessage,
      normalizationSteps: validation.normalizationSteps,
      warnings: validation.warnings,
      latencyMs,
      model: modelName,
      status: validation.status,
    });
  } catch (err) {
    console.error('[Capture] Unhandled error:', err);
    res.status(500).json({
      success: false,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred during capture.',
    });
  }
});
