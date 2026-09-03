import { prisma } from '../../lib/prisma.js';

export function createForUser(userId: string) {
  return prisma.account.create({ data: { userId } });
}

export function findById(id: string) {
  return prisma.account.findUnique({ where: { id } });
}
