import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { registerSchema, loginSchema } from './auth.schemas.js';
import { registerHandler, loginHandler } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), registerHandler);
authRouter.post('/login', validateBody(loginSchema), loginHandler);
