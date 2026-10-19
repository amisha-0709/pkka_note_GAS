import { Router } from 'express';
import { auditDb } from '../persistence/database.ts';

export const recordsRouter = Router();

recordsRouter.get('/api/records', (req, res) => {
  const sessionId = req.query.session_id as string;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      errorCode: 'MISSING_SESSION_ID',
      message: 'A session_id query parameter is required to retrieve session records.',
    });
  }

  const records = auditDb.getSessionRecords(sessionId);
  if (!records.session && records.captures.length === 0) {
    return res.status(404).json({
      success: false,
      errorCode: 'SESSION_NOT_FOUND',
      message: `No audit records found for session ID "${sessionId}".`,
    });
  }

  res.json({
    success: true,
    session: records.session,
    captures: records.captures,
    events: records.events,
  });
});

recordsRouter.get('/api/sessions', (req, res) => {
  const sessions = auditDb.getAllSessions();
  res.json({
    success: true,
    sessions,
  });
});
