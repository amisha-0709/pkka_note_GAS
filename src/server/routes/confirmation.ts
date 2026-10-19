import { Router } from 'express';
import {
  classifyConfirmationInput,
  createStateEvent,
  canTransition,
} from '../../lib/confirmationStateMachine.ts';
import { validateFieldCandidate } from '../../lib/fieldEngine.ts';
import { auditDb } from '../persistence/database.ts';

export const confirmationRouter = Router();

confirmationRouter.post('/api/confirmation', (req, res) => {
  const { sessionId, captureId, candidate, action, spokenText, attempt = 1 } = req.body;

  // 1. Validate required parameter presence
  if (!sessionId || !candidate || !captureId) {
    return res.status(400).json({
      success: false,
      confirmed: false,
      errorCode: 'MISSING_PARAMETERS',
      message: 'sessionId, captureId, and candidate are all strictly required for confirmation.',
    });
  }

  // 2. Verify capture exists
  const capture = auditDb.getCapture(captureId);
  if (!capture) {
    return res.status(404).json({
      success: false,
      confirmed: false,
      errorCode: 'NONEXISTENT_CAPTURE',
      message: `Capture record "${captureId}" does not exist in audit database.`,
    });
  }

  // 3. Verify capture belongs to the specified session
  if (capture.sessionId !== sessionId) {
    return res.status(400).json({
      success: false,
      confirmed: false,
      errorCode: 'CAPTURE_SESSION_MISMATCH',
      message: `Capture "${captureId}" belongs to session "${capture.sessionId}", not "${sessionId}".`,
    });
  }

  // 4. Verify candidate matches current capture record (not stale)
  if (capture.normalizedCandidate !== candidate) {
    return res.status(409).json({
      success: false,
      confirmed: false,
      errorCode: 'STALE_CANDIDATE',
      message: `Submitted candidate "${candidate}" does not match the active capture candidate "${capture.normalizedCandidate}".`,
    });
  }

  // 5. Verify candidate passed field validation
  const validation = validateFieldCandidate(capture.field, candidate);
  if (!validation.valid || capture.validityStatus !== 'valid_candidate') {
    return res.status(422).json({
      success: false,
      confirmed: false,
      errorCode: 'INVALID_CANDIDATE',
      message: `Candidate "${candidate}" failed field validation (${validation.validationMessage}) and cannot be confirmed.`,
    });
  }

  // Determine user intent
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

  // 6. If confirming, verify that read-back succeeded for this exact capture
  if (intent === 'confirm') {
    const readbackOk = auditDb.hasSuccessfulReadBack(sessionId, captureId, candidate);
    if (!readbackOk) {
      return res.status(412).json({
        success: false,
        confirmed: false,
        errorCode: 'READBACK_REQUIRED',
        message:
          'Spoken read-back must succeed for this exact capture before user confirmation can be accepted.',
      });
    }

    // 7. Verify state transition from current session state
    const session = auditDb.getSession(sessionId);
    const currentState = session?.status || 'read_back';
    if (!canTransition(currentState, 'confirmed')) {
      return res.status(409).json({
        success: false,
        confirmed: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        message: `Cannot transition session from "${currentState}" to "confirmed". Read-back must precede confirmation.`,
      });
    }

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
    const session = auditDb.getSession(sessionId);
    const currentState = session?.status || 'read_back';
    if (!canTransition(currentState, 'rejected')) {
      return res.status(409).json({
        success: false,
        confirmed: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        message: `Cannot transition session from "${currentState}" to "rejected".`,
      });
    }

    auditDb.insertEvent(
      createStateEvent(sessionId, currentState, 'rejected', attempt, captureId, undefined, {
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
    message:
      'Confirmation utterance was unclear. Please repeat "Yes" or "No", or click Confirm/Reject directly.',
    classificationDetail,
  });
});
