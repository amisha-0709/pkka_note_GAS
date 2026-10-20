import { Router } from 'express';
import type { FieldType } from '../../types/index.ts';
import { applyCorrection, createStateEvent } from '../../lib/confirmationStateMachine.ts';
import { auditDb } from '../persistence/database.ts';

export const correctionRouter = Router();

correctionRouter.post('/api/correction', async (req, res) => {
  try {
    const {
      sessionId,
      captureId,
      field,
      previousCandidate,
      mode = 'full',
      correctionInput,
      lastN,
      startIndex,
      attempt = 1,
    } = req.body;

    // 1. Validate required presence
    if (!sessionId || !previousCandidate || typeof correctionInput !== 'string') {
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_PARAMETERS',
        message: 'sessionId, previousCandidate, and correctionInput are strictly required.',
      });
    }

    if (!captureId) {
      return res.status(400).json({
        success: false,
        errorCode: 'MISSING_CAPTURE_ID',
        message: 'captureId is required to associate correction with the active capture.',
      });
    }

    // 2. Verify capture exists and belongs to session
    const capture = auditDb.getCapture(captureId);
    if (!capture) {
      return res.status(404).json({
        success: false,
        errorCode: 'NONEXISTENT_CAPTURE',
        message: `Capture record "${captureId}" does not exist.`,
      });
    }

    if (capture.sessionId !== sessionId) {
      return res.status(400).json({
        success: false,
        errorCode: 'CAPTURE_SESSION_MISMATCH',
        message: `Capture "${captureId}" does not belong to session "${sessionId}".`,
      });
    }

    const fieldType = (field || capture.field || 'mobile_number') as FieldType;

    // 3. Validate partial-correction parameters
    if (mode === 'replace_last_n') {
      const n = Number(lastN);
      if (!Number.isInteger(n) || n < 1 || n > previousCandidate.length) {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_PARTIAL_CORRECTION',
          message: `lastN must be an integer between 1 and ${previousCandidate.length} (received: ${lastN}).`,
        });
      }
      if (!correctionInput.trim()) {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_PARTIAL_CORRECTION',
          message: 'Correction replacement input cannot be empty for replace_last_n mode.',
        });
      }
    } else if (mode === 'replace_at_index') {
      const idx = Number(startIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= previousCandidate.length) {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_PARTIAL_CORRECTION',
          message: `startIndex must be an integer between 0 and ${previousCandidate.length - 1} (received: ${startIndex}).`,
        });
      }
    } else if (mode !== 'full') {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_CORRECTION_MODE',
        message: `Unknown correction mode "${mode}". Supported: full, replace_last_n, replace_at_index.`,
      });
    }

    // 4. Apply correction and revalidate candidate using FieldEngine
    const result = applyCorrection(previousCandidate, fieldType, {
      mode,
      correctionInput,
      lastN: lastN !== undefined ? Number(lastN) : undefined,
      startIndex: startIndex !== undefined ? Number(startIndex) : undefined,
    });

    // 5. Update active candidate on the capture in audit database and record events
    try {
      await auditDb.updateCaptureCandidate(
        captureId,
        result.mergedValue,
        result.success,
        result.validation.validationMessage
      );

      // Record audit state event: Rejected -> Corrected
      await auditDb.insertEvent(
        createStateEvent(sessionId, 'rejected', 'corrected', attempt, captureId, undefined, {
          mode,
          previousCandidate,
          proposedCorrection: correctionInput,
          mergedValue: result.mergedValue,
          valid: result.success,
        })
      );

      // 6. Transition session state: Corrected -> valid_candidate (or invalid_candidate)
      // Crucial: State is now valid_candidate, requiring another read-back before confirmation!
      if (result.success) {
        await auditDb.insertEvent(
          createStateEvent(sessionId, 'corrected', 'valid_candidate', attempt, captureId, undefined, {
            candidate: result.mergedValue,
          })
        );
        await auditDb.updateSessionStatus(sessionId, 'valid_candidate');
      } else {
        await auditDb.insertEvent(
          createStateEvent(sessionId, 'corrected', 'invalid_candidate', attempt, captureId, undefined, {
            candidate: result.mergedValue,
            validationError: result.validation.validationMessage,
          })
        );
        await auditDb.updateSessionStatus(sessionId, 'invalid_candidate');
      }
    } catch (persistErr) {
      console.error('[Correction] Persistence error:', persistErr);
      return res.status(500).json({
        success: false,
        errorCode: 'AUDIT_PERSISTENCE_FAILED',
        message: 'Failed to persist correction to audit store.',
      });
    }

    res.status(result.success ? 200 : 422).json({
      success: result.success,
      previousCandidate,
      proposedCandidate: result.proposedCandidate,
      mergedCandidate: result.mergedValue,
      valid: result.success,
      validationMessage: result.message,
      normalizationSteps: result.validation.normalizationSteps,
      warnings: result.validation.warnings,
      status: result.validation.status,
    });
  } catch (err) {
    console.error('[Correction] Unhandled error:', err);
    res.status(500).json({
      success: false,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred during correction.',
    });
  }
});
