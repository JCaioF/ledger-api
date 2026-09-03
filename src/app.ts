import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { authMiddleware, requireRole } from './middleware/auth.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { accountsRouter } from './modules/accounts/accounts.routes.js';
import { InsufficientFundsError } from './domain/errors.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/accounts', accountsRouter);

  if (config.nodeEnv === 'test') {
    app.get('/__boom', () => {
      throw new InsufficientFundsError();
    });
    app.get('/__crash', () => {
      throw new Error('kaboom');
    });
    app.get('/__me', authMiddleware, (req, res) => res.json(req.auth));
    app.get('/__admin', authMiddleware, requireRole('ADMIN'), (_req, res) =>
      res.json({ ok: true }),
    );
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
