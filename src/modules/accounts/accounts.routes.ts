import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createAccountHandler, getAccountHandler, depositHandler } from './accounts.controller.js';
import { depositSchema } from './accounts.schemas.js';

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
