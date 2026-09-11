import 'express-async-errors';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Request } from 'express';
import helmet from 'helmet';
import cors from 'cors';
// Named import (e não `import pinoHttp from 'pino-http'`): pino-http é CJS, e sob
// moduleResolution NodeNext o default de um CJS visto de um módulo ESM é o objeto
// `module.exports` inteiro — que o TS não considera chamável. O runtime exporta
// `module.exports.pinoHttp = pinoLogger`, então o named funciona nos dois lados.
import { pinoHttp } from 'pino-http';
import { parse as parseYaml } from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { authMiddleware, requireRole } from './middleware/auth.js';
import { authLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { accountsRouter } from './modules/accounts/accounts.routes.js';
import { transfersRouter } from './modules/transfers/transfers.routes.js';
import { InsufficientFundsError } from './domain/errors.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(requestId);
  // Depois do requestId, para que cada linha de log carregue o mesmo `req.id` que
  // vai no header `x-request-id` e no corpo dos erros — é o que liga um relato de
  // usuário à linha correspondente. Sem isso, uma requisição bem-sucedida não
  // produz log nenhum e a instância em produção fica cega.
  // Em NODE_ENV=test o `logger` é `silent` (ver src/lib/logger.ts), então a saída
  // da suíte continua limpa.
  app.use(pinoHttp({ logger, genReqId: (req) => (req as Request).id }));
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/auth', authLimiter, authRouter);
  app.use('/accounts', accountsRouter);
  app.use('/transfers', transfersRouter);

  const openapiPath = path.join(process.cwd(), 'openapi.yaml');
  const openapiRaw = readFileSync(openapiPath, 'utf8');
  const openapiDoc = parseYaml(openapiRaw);

  app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').send(openapiRaw));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));

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
