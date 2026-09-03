import 'dotenv/config';
import { buildApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';

buildApp().listen(config.port, () => logger.info(`ledger-api listening on ${config.port}`));
