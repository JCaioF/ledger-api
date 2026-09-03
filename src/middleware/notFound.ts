import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../domain/errors.js';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError('Route not found'));
}
