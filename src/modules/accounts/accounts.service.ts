import * as repo from './accounts.repository.js';
import { AccountNotFoundError, ForbiddenError } from '../../domain/errors.js';
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
