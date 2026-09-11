import { randomUUID } from 'node:crypto';
import * as repo from './accounts.repository.js';
import { AccountNotFoundError, ForbiddenError } from '../../domain/errors.js';
import { parseAmountToCents } from '../../domain/money.js';
import { executeTransfer } from '../transfers/transfer.service.js';
import { TREASURY_ACCOUNT_ID } from '../../config/constants.js';
import { toEntryDTO } from './entry.dto.js';
import type { AuthContext } from '../../middleware/auth.js';

interface StatementQuery {
  limit: number;
  cursor?: string;
  from?: Date;
  to?: Date;
}

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

  // Defesa em profundidade: um deploy onde o seed não rodou não tem a conta
  // `treasury`, e o findUniqueOrThrow lá dentro do performTransfer estouraria um
  // P2025 cru → 500 "Internal server error", sem pista do que está faltando.
  const treasury = await repo.findById(TREASURY_ACCOUNT_ID);
  if (!treasury) {
    throw new AccountNotFoundError(
      `Treasury account "${TREASURY_ACCOUNT_ID}" is missing — run the database seed`,
    );
  }

  const { transfer } = await executeTransfer({
    fromAccountId: TREASURY_ACCOUNT_ID,
    toAccountId: accountId,
    amount: parseAmountToCents(amount),
    idempotencyKey: `deposit:${randomUUID()}`,
  });
  return transfer;
}

export async function getStatement(auth: AuthContext, accountId: string, query: StatementQuery) {
  await getAccount(auth, accountId); // reaproveita checagem de posse / 404
  const rows = await repo.listEntries({ accountId, ...query });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    entries: page.map(toEntryDTO),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
