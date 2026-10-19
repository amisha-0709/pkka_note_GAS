import { Router } from 'express';
import { getServerConfig, getMaskedApiKey } from '../config/environment.ts';
import { auditDb } from '../persistence/database.ts';
import type { SystemHealth } from '../../types/index.ts';

export const healthRouter = Router();

const START_TIME = Date.now();

healthRouter.get('/api/health', (req, res) => {
  const config = getServerConfig();
  const stats = auditDb.getStats();

  const health: SystemHealth = {
    status: config.isGnaniConfigured ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    gnaniConfig: {
      sttConfigured: config.isGnaniConfigured,
      ttsConfigured: config.isGnaniConfigured,
      sttEndpoint: config.sttEndpoint,
      ttsEndpoint: config.ttsEndpoint,
      maskedApiKey: getMaskedApiKey(),
      sttModel: 'Prisma v3',
      ttsModel: config.ttsModel,
      ttsVoice: config.ttsVoice,
    },
    persistence: {
      engine: stats.engine,
      totalSessions: stats.totalSessions,
      totalCaptures: stats.totalCaptures,
      totalEvents: stats.totalEvents,
    },
  };

  res.json(health);
});
