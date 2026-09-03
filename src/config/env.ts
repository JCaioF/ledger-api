import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1h'),
  AUTH_RATE_MAX: z.coerce.number().default(5),
  TRANSFER_RATE_MAX: z.coerce.number().default(30),
  CORS_ORIGINS: z.string().default(''),
});

const parsed = schema.parse(process.env);

export const config = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databaseUrl: parsed.DATABASE_URL,
  redisUrl: parsed.REDIS_URL,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  authRateMax: parsed.AUTH_RATE_MAX,
  transferRateMax: parsed.TRANSFER_RATE_MAX,
  corsOrigins: parsed.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
