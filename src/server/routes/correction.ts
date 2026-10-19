import { Router } from 'express';
import type { FieldType } from '../../types/index.ts';
import { applyCorrection, createStateEvent } from '../../lib/confirmationStateMachine.ts';
import { auditDb } from '../persistence/database.ts';

export const correctionRouter = Router();

correctionRouter.post('/api/correction', (req, res) => {
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

  if (!sessionId || !previousCandidate || !correctionInput) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_PARAMETERS',
      message: 'sessionId, previousCandidate, and correctionInput are required.',
    });
  }

  const fieldType = (field || 'mobile_number') as FieldType;

  const result = applyCorrection(previousCandidate, fieldType, {
    mode,
    correctionInput,
    lastN,
    startIndex,
  });

  // Audit state: CORRECTED
  auditDb.insertEvent(
    createStateEvent(sessionId, 'rejected', 'corrected', attempt, captureId, undefined, {
      mode,
      previousCandidate,
      proposedCorrection: correctionInput,
      mergedValue: result.mergedValue,
      valid: result.success,
    })
  );

  // If valid, transition to valid_candidate for read-back
  if (result.success) {
    auditDb.insertEvent(
      createStateEvent(sessionId, 'corrected', 'valid_candidate', attempt, captureId, undefined, {
        candidate: result.mergedValue,
      })
    );
    auditDb.updateSessionStatus(sessionId, 'valid_candidate');
  } else {
    auditDb.updateSessionStatus(sessionId, 'invalid_candidate');
  }

  res.json({
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
});
