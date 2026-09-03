import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
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

  if (config.nodeEnv === 'test') {
    app.get('/__boom', () => {
      throw new InsufficientFundsError();
    });
    app.get('/__crash', () => {
      throw new Error('kaboom');
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
