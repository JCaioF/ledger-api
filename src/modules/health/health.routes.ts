import { Router } from 'express';
import { checkHealth } from './health.service.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const result = await checkHealth();
  const ok = result.db === 'up' && result.redis === 'up';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', ...result });
});
