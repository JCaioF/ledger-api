import type { LedgerEntry } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export function createForUser(userId: string) {
  return prisma.account.create({ data: { userId } });
}

export function findById(id: string) {
  return prisma.account.findUnique({ where: { id } });
}

// Paginação por cursor usa `id` (cuid), não `createdAt`: cuids são ordenáveis
// lexicograficamente por ordem de geração, então a paginação é estável (sem
// duplicatas/gaps entre páginas mesmo com inserções concorrentes), mas não é
// estritamente cronológica. Limitação conhecida e documentada, não um bug.
export function listEntries(params: {
  accountId: string;
  limit: number;
  cursor?: string;
  from?: Date;
  to?: Date;
}): Promise<LedgerEntry[]> {
  const { accountId, limit, cursor, from, to } = params;
  return prisma.ledgerEntry.findMany({
    where: {
      accountId,
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
}
