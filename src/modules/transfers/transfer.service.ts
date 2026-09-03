import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { performTransfer, type TransferParams } from './ledger.repository.js';
import * as accountsRepo from '../accounts/accounts.repository.js';
import { parseAmountToCents } from '../../domain/money.js';
import { AccountNotFoundError, ForbiddenError, NotFoundError } from '../../domain/errors.js';
import type { AuthContext } from '../../middleware/auth.js';

export async function executeTransfer(params: TransferParams) {
  try {
    return await prisma.$transaction((tx) => performTransfer(tx, params));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const transfer = await prisma.transfer.findUniqueOrThrow({
        where: { idempotencyKey: params.idempotencyKey },
      });
      return { transfer, reused: true };
    }
    throw err;
  }
}

export async function createTransfer(
  auth: AuthContext,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    idempotencyKey: string;
  },
) {
  const from = await accountsRepo.findById(input.fromAccountId);
  if (!from) throw new AccountNotFoundError();
  if (auth.role !== 'ADMIN' && from.userId !== auth.userId) {
    throw new ForbiddenError('Not your account');
  }
  const to = await accountsRepo.findById(input.toAccountId);
  if (!to) throw new AccountNotFoundError();

  return executeTransfer({
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: parseAmountToCents(input.amount),
    idempotencyKey: `${auth.userId}:${input.idempotencyKey}`,
  });
}

export async function getTransfer(auth: AuthContext, id: string) {
  const transfer = await prisma.transfer.findUnique({ where: { id } });
  if (!transfer) throw new NotFoundError('Transfer not found');
  if (auth.role === 'ADMIN') return transfer;

  const accounts = await prisma.account.findMany({
    where: { id: { in: [transfer.fromAccountId, transfer.toAccountId] } },
  });
  const isParticipant = accounts.some((a) => a.userId === auth.userId);
  if (!isParticipant) throw new ForbiddenError('Not a participant of this transfer');
  return transfer;
}
