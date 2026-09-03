import argon2 from 'argon2';
import { prisma } from '../../src/lib/prisma.js';

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
