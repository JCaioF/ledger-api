import type { Prisma, Transfer } from '@prisma/client';
import { InsufficientFundsError, ValidationError } from '../../domain/errors.js';
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

  // Mesma conta nos dois lados: os dois updates partiriam do mesmo pre-image e o segundo
  // sobrescreveria o primeiro, criando `amount` do nada. O lock de linha não protege disso
  // (é intra-transação), então a guarda tem que viver aqui, no núcleo.
  if (fromAccountId === toAccountId) {
    throw new ValidationError('fromAccountId and toAccountId must differ');
  }

  // amount <= 0 fura a checagem de saldo (`100n < -50n` é false) e inverte o fluxo de dinheiro.
  if (amount <= 0n) {
    throw new ValidationError('amount must be greater than zero');
  }

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
