import { prisma } from '../../src/lib/prisma.js';

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "LedgerEntry","Transfer","Account","User" RESTART IDENTITY CASCADE',
  );
}
