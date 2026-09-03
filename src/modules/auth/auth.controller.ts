import type { Request, Response } from 'express';
import * as service from './auth.service.js';

export async function registerHandler(req: Request, res: Response) {
  const user = await service.register(req.body.email, req.body.password);
  res.status(201).json(user);
}

export async function loginHandler(req: Request, res: Response) {
  const result = await service.login(req.body.email, req.body.password);
  res.status(200).json(result);
}
