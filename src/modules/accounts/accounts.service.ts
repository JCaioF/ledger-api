import { randomUUID } from 'node:crypto';
import * as repo from './accounts.repository.js';
import { AccountNotFoundError, ForbiddenError } from '../../domain/errors.js';
import { parseAmountToCents } from '../../domain/money.js';
import { executeTransfer } from '../transfers/transfer.service.js';
import { TREASURY_ACCOUNT_ID } from '../../config/constants.js';
import type { AuthContext } from '../../middleware/auth.js';

export async function createAccount(userId: string) {
  return repo.createForUser(userId);
}

export async function getAccount(auth: AuthContext, accountId: string) {
  const account = await repo.findById(accountId);
  if (!account) throw new AccountNotFoundError();
  if (auth.role !== 'ADMIN' && account.userId !== auth.userId) {
    throw new ForbiddenError('Not your account');
  }
  return account;
}

export async function deposit(accountId: string, amount: number) {
  const account = await repo.findById(accountId);
  if (!account) throw new AccountNotFoundError();
  const { transfer } = await executeTransfer({
    fromAccountId: TREASURY_ACCOUNT_ID,
    toAccountId: accountId,
    amount: parseAmountToCents(amount),
    idempotencyKey: `deposit:${randomUUID()}`,
  });
  return transfer;
}
