import argon2 from 'argon2';
import { prisma } from '../../src/lib/prisma.js';
import { TREASURY_ACCOUNT_ID } from '../../src/config/constants.js';

let counter = 0;

export async function makeUser(email?: string, role: 'USER' | 'ADMIN' = 'USER') {
  counter += 1;
  return prisma.user.create({
    data: {
      email: email ?? `user${counter}-${Date.now()}@test.local`,
      passwordHash: await argon2.hash('password123'),
      role,
    },
  });
}

export async function makeAccount(userId: string, balance = 0n) {
  return prisma.account.create({ data: { userId, balance } });
}

export async function makeTreasury() {
  const admin = await makeUser(undefined, 'ADMIN');
  return prisma.account.create({
    data: { id: TREASURY_ACCOUNT_ID, userId: admin.id, balance: 0n },
  });
}
