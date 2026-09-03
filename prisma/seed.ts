import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { TREASURY_ACCOUNT_ID } from '../src/config/constants.js';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ledger.local' },
    update: {},
    create: {
      email: 'admin@ledger.local',
      passwordHash: await argon2.hash('admin12345'),
      role: 'ADMIN',
    },
  });

  await prisma.account.upsert({
    where: { id: TREASURY_ACCOUNT_ID },
    update: {},
    create: { id: TREASURY_ACCOUNT_ID, userId: admin.id, balance: 0n },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    await prisma.$disconnect();
    throw err;
  });
