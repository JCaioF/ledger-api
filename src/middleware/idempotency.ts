import type { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis.js';
import { ValidationError, ConflictError } from '../domain/errors.js';

const TTL_SECONDS = 60 * 60 * 24;

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key) return next(new ValidationError('Idempotency-Key header is required'));

  const scope = `idem:${req.auth?.userId ?? 'anon'}:${key}`;

  const cached = await redis.get(scope);
  if (cached) {
    const { status, body } = JSON.parse(cached) as { status: number; body: unknown };
    return res.status(status).json(body);
  }

  const locked = await redis.set(`${scope}:lock`, '1', 'EX', 30, 'NX');
  if (!locked) {
    return next(new ConflictError('A request with this Idempotency-Key is already in progress'));
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis
        .set(scope, JSON.stringify({ status: res.statusCode, body }), 'EX', TTL_SECONDS)
        .catch(() => undefined);
    }
    redis.del(`${scope}:lock`).catch(() => undefined);
    return originalJson(body);
  };

  next();
}
