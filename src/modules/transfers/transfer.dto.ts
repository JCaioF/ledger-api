import type { Transfer } from '@prisma/client';

export function toTransferDTO(t: Transfer) {
  return {
    id: t.id,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    amount: t.amount.toString(),
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  };
}
