import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { executeTransfer } from '../../src/modules/transfers/transfer.service.js';
import { InsufficientFundsError } from '../../src/domain/errors.js';
import { makeUser, makeAccount } from '../helpers/factories.js';

async function twoAccounts(fromBalance: bigint, toBalance = 0n) {
  const a = await makeUser();
  const b = await makeUser();
  const from = await makeAccount(a.id, fromBalance);
  const to = await makeAccount(b.id, toBalance);
  return { from, to };
}

describe('concorrência', () => {
  it('duas transferências paralelas do saldo exato: uma passa, uma falha', async () => {
    const { from, to } = await twoAccounts(100n);

    const results = await Promise.allSettled([
      executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 100n,
        idempotencyKey: 'c1',
      }),
      executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 100n,
        idempotencyKey: 'c2',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFundsError);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    const toAfter = await prisma.account.findUniqueOrThrow({ where: { id: to.id } });
    expect(fromAfter.balance).toBe(0n);
    expect(toAfter.balance).toBe(100n);
    expect(await prisma.transfer.count()).toBe(1);
  });

  it('8 transferências paralelas com a mesma Idempotency-Key: só uma processa, resto reusa', async () => {
    const { from, to } = await twoAccounts(1000n);

    const calls = Array.from({ length: 8 }, () =>
      executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 100n,
        idempotencyKey: 'race-key',
      }),
    );
    const results = await Promise.allSettled(calls);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof executeTransfer>>> =>
        r.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(8);

    const notReused = fulfilled.filter((r) => r.value.reused === false);
    const reused = fulfilled.filter((r) => r.value.reused === true);
    expect(notReused).toHaveLength(1);
    expect(reused).toHaveLength(7);

    const transferIds = new Set(fulfilled.map((r) => r.value.transfer.id));
    expect(transferIds.size).toBe(1);

    expect(await prisma.transfer.count()).toBe(1);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    expect(fromAfter.balance).toBe(900n);
  });

  it('reconciliação: soma dos lançamentos = balance', async () => {
    const openingFrom = 300n;
    const openingTo = 0n;
    const { from, to } = await twoAccounts(openingFrom, openingTo);

    await executeTransfer({
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: 100n,
      idempotencyKey: 'r1',
    });
    await executeTransfer({
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: 100n,
      idempotencyKey: 'r2',
    });
    await executeTransfer({
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: 100n,
      idempotencyKey: 'r3',
    });

    for (const [account, opening] of [
      [from, openingFrom],
      [to, openingTo],
    ] as const) {
      const entries = await prisma.ledgerEntry.findMany({ where: { accountId: account.id } });
      const delta = entries.reduce(
        (sum, e) => sum + (e.direction === 'CREDIT' ? e.amount : -e.amount),
        0n,
      );
      const current = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(opening + delta).toBe(current.balance);
    }
  });
});
