import type { LedgerEntry } from '@prisma/client';

export function toEntryDTO(e: LedgerEntry) {
  return {
    id: e.id,
    transferId: e.transferId,
    direction: e.direction,
    amount: e.amount.toString(),
    balanceAfter: e.balanceAfter.toString(),
    createdAt: e.createdAt.toISOString(),
  };
}
