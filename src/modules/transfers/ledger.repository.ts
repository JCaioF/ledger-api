import type { Prisma, Transfer } from '@prisma/client';
import { InsufficientFundsError } from '../../domain/errors.js';
import { TREASURY_ACCOUNT_ID } from '../../config/constants.js';

export interface TransferParams {
  fromAccountId: string;
  toAccountId: string;
  amount: bigint;
  idempotencyKey: string;
}

export async function performTransfer(
  tx: Prisma.TransactionClient,
  params: TransferParams,
): Promise<{ transfer: Transfer; reused: boolean }> {
  const { fromAccountId, toAccountId, amount, idempotencyKey } = params;

  const existing = await tx.transfer.findUnique({ where: { idempotencyKey } });
  if (existing) return { transfer: existing, reused: true };

  // Lock das duas linhas em ordem determinística (id ascendente) evita deadlock.
  const [firstLock, secondLock] = [fromAccountId, toAccountId].sort();
  await tx.$queryRaw`SELECT 1 FROM "Account" WHERE id = ${firstLock} FOR UPDATE`;
  await tx.$queryRaw`SELECT 1 FROM "Account" WHERE id = ${secondLock} FOR UPDATE`;

  const from = await tx.account.findUniqueOrThrow({ where: { id: fromAccountId } });
  const to = await tx.account.findUniqueOrThrow({ where: { id: toAccountId } });

  if (fromAccountId !== TREASURY_ACCOUNT_ID && from.balance < amount) {
    throw new InsufficientFundsError();
  }

  const fromBalance = from.balance - amount;
  const toBalance = to.balance + amount;

  await tx.account.update({ where: { id: fromAccountId }, data: { balance: fromBalance } });
  await tx.account.update({ where: { id: toAccountId }, data: { balance: toBalance } });

  const transfer = await tx.transfer.create({
    data: {
      idempotencyKey,
      fromAccountId,
      toAccountId,
      amount,
      status: 'COMPLETED',
      entries: {
        create: [
          { accountId: fromAccountId, direction: 'DEBIT', amount, balanceAfter: fromBalance },
          { accountId: toAccountId, direction: 'CREDIT', amount, balanceAfter: toBalance },
        ],
      },
    },
  });

  return { transfer, reused: false };
}
