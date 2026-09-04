import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  createAccountHandler,
  getAccountHandler,
  depositHandler,
  statementHandler,
} from './accounts.controller.js';
import { depositSchema, statementQuerySchema } from './accounts.schemas.js';

export const accountsRouter = Router();

accountsRouter.use(authMiddleware);
accountsRouter.post('/', createAccountHandler);
accountsRouter.post(
  '/:id/deposits',
  requireRole('ADMIN'),
  validateBody(depositSchema),
  depositHandler,
);
accountsRouter.get('/:id', getAccountHandler);
accountsRouter.get('/:id/statement', validateQuery(statementQuerySchema), statementHandler);
