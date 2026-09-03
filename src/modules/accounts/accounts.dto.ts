import type { Account } from '@prisma/client';

export function toAccountDTO(a: Account) {
  return {
    id: a.id,
    userId: a.userId,
    balance: a.balance.toString(),
    currency: a.currency,
    createdAt: a.createdAt.toISOString(),
  };
}
