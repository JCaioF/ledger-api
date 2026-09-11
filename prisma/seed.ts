import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { TREASURY_ACCOUNT_ID } from '../src/config/constants.js';

const prisma = new PrismaClient();

async function main() {
  // System user: always seeded, unconditionally. It owns the treasury account
  // but is not intended to ever be logged into — its password hash is a random
  // UUID that is never logged, stored anywhere else, or displayed. Deposits and
  // transfers only need the treasury account to exist; they don't care who owns it.
  const system = await prisma.user.upsert({
    where: { email: 'system@ledger.local' },
    update: {},
    create: {
      email: 'system@ledger.local',
      passwordHash: await argon2.hash(randomUUID()),
      role: 'USER',
    },
  });

  await prisma.account.upsert({
    where: { id: TREASURY_ACCOUNT_ID },
    update: {},
    create: { id: TREASURY_ACCOUNT_ID, userId: system.id, balance: 0n },
  });

  // Login-capable admin: optional, gated behind ADMIN_PASSWORD. Read directly
  // from process.env (not the zod-validated src/config/env.ts) so this script
  // keeps zero import chain into app config and can't fail at boot on an
  // unrelated env-validation issue.
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    await prisma.user.upsert({
      where: { email: 'admin@ledger.local' },
      update: {},
      create: {
        email: 'admin@ledger.local',
        passwordHash: await argon2.hash(adminPassword),
        role: 'ADMIN',
      },
    });
  } else {
    // This script runs standalone at container boot, before the app's pino
    // logger context exists. The repo's `no-console` eslint rule has no
    // override for this file, so use process.stderr.write directly instead.
    process.stderr.write(
      'ADMIN_PASSWORD not set — skipping admin user seed. Treasury and money movement between existing accounts still work; admin-only endpoints (deposits) will be inaccessible until an admin is provisioned.\n',
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    await prisma.$disconnect();
    throw err;
  });
