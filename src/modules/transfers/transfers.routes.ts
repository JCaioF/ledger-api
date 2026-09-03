import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { createTransferSchema } from './transfer.schemas.js';
import { createTransferHandler, getTransferHandler } from './transfers.controller.js';

export const transfersRouter = Router();

transfersRouter.use(authMiddleware);
transfersRouter.post('/', validateBody(createTransferSchema), createTransferHandler);
transfersRouter.get('/:id', getTransferHandler);
