import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { healthRouter } from './modules/health/health.routes.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json());

  app.use('/health', healthRouter);

  return app;
}
