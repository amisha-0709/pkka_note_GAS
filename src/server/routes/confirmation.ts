import { Router } from 'express';
import { classifyConfirmationInput, createStateEvent } from '../../lib/confirmationStateMachine.ts';
import { auditDb } from '../persistence/database.ts';

export const confirmationRouter = Router();

confirmationRouter.post('/api/confirmation', (req, res) => {
  const { sessionId, captureId, candidate, action, spokenText, attempt = 1 } = req.body;

  if (!sessionId || !candidate) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_PARAMETERS',
      message: 'Both sessionId and candidate are required for confirmation.',
    });
  }

  let intent: 'confirm' | 'reject' | 'unclear' = 'unclear';
  let classificationDetail = 'Direct manual action';

  if (action === 'confirm') {
    intent = 'confirm';
    classificationDetail = 'User clicked manual Confirm button';
  } else if (action === 'reject') {
    intent = 'reject';
    classificationDetail = 'User clicked manual Reject / Correction button';
  } else if (action === 'voice_input') {
    const classification = classifyConfirmationInput(spokenText || '');
    intent = classification.intent;
    classificationDetail = classification.confidenceDescription;
  }

  if (intent === 'confirm') {
    // Explicit confirmation: Finalize value
    auditDb.insertEvent(
      createStateEvent(sessionId, 'read_back', 'confirmed', attempt, captureId, candidate, {
        classificationDetail,
        spokenText,
      })
    );
    auditDb.updateSessionStatus(sessionId, 'confirmed', candidate);

    return res.json({
      success: true,
      confirmed: true,
      newState: 'confirmed',
      finalValue: candidate,
      message: 'Value explicitly confirmed by user. Audit record finalized.',
      classificationDetail,
    });
  }

  if (intent === 'reject') {
    // Explicit rejection: Transition to rejected / ready for correction
    auditDb.insertEvent(
      createStateEvent(sessionId, 'read_back', 'rejected', attempt, captureId, undefined, {
        classificationDetail,
        spokenText,
      })
    );
    auditDb.updateSessionStatus(sessionId, 'rejected');

    return res.json({
      success: true,
      confirmed: false,
      newState: 'rejected',
      message: 'Candidate value rejected. Correction panel opened.',
      classificationDetail,
    });
  }

  // Ambiguous / unclear: Never auto-confirm
  auditDb.insertEvent(
    createStateEvent(sessionId, 'read_back', 'uncertain', attempt, captureId, undefined, {
      classificationDetail,
      spokenText,
    })
  );
  auditDb.updateSessionStatus(sessionId, 'uncertain');

  res.json({
    success: false,
    confirmed: false,
    newState: 'uncertain',
    message: 'Confirmation utterance was unclear. Please repeat "Yes" or "No", or click Confirm/Reject directly.',
    classificationDetail,
  });
});
