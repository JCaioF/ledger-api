import type { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../domain/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      code: err.code,
      message: err.message,
      requestId: req.id,
    };
    if (err instanceof ValidationError && err.details) body.details = err.details;
    return res.status(err.statusCode).json({ error: body });
  }
  logger.error({ err, requestId: req.id }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error', requestId: req.id },
  });
}
