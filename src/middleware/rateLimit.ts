import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { redis } from '../lib/redis.js';
import { config } from '../config/env.js';

// ioredis's `call` overloads are typed as a tuple `[command, ...args]`, which
// rejects a plain `string[]` spread ("must have a tuple type or be passed to
// a rest parameter"). Bind + cast to a plain rest-string[] signature so the
// spread type-checks, matching rate-limit-redis's `SendCommandFn` shape.
const call = redis.call.bind(redis) as unknown as (...args: string[]) => Promise<never>;

function store(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => call(...args),
  });
}

function handler(_req: Request, res: Response) {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      requestId: (res.req as Request).id,
    },
  });
}

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: config.authRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: store('rl:auth:'),
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler,
});

export const transferLimiter = rateLimit({
  windowMs: 60_000,
  max: config.transferRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: store('rl:transfer:'),
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'unknown',
  handler,
});
