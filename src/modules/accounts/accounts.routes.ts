import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { createAccountHandler, getAccountHandler } from './accounts.controller.js';

export const accountsRouter = Router();

accountsRouter.use(authMiddleware);
accountsRouter.post('/', createAccountHandler);
accountsRouter.get('/:id', getAccountHandler);
