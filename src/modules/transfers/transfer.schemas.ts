import { z } from 'zod';

export const createTransferSchema = z
  .object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    amount: z.number().int().positive(),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: 'fromAccountId and toAccountId must differ',
    path: ['toAccountId'],
  });
