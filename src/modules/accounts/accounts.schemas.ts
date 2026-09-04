import { z } from 'zod';

export const depositSchema = z.object({
  amount: z.number().int().positive(),
});

export const statementQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
