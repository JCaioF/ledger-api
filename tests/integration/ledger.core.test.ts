import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { executeTransfer } from '../../src/modules/transfers/transfer.service.js';
import { InsufficientFundsError } from '../../src/domain/errors.js';
import { makeUser, makeAccount } from '../helpers/factories.js';

async function twoAccounts(fromBalance: bigint) {
  const a = await makeUser();
  const b = await makeUser();
  const from = await makeAccount(a.id, fromBalance);
  const to = await makeAccount(b.id, 0n);
  return { from, to };
}

describe('performTransfer via executeTransfer', () => {
  it('move saldo e cria 2 lançamentos com balanceAfter', async () => {
    const { from, to } = await twoAccounts(1000n);
    const { transfer, reused } = await executeTransfer({
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: 400n,
      idempotencyKey: 'k1',
    });
    expect(reused).toBe(false);
    expect(transfer.status).toBe('COMPLETED');

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    const toAfter = await prisma.account.findUniqueOrThrow({ where: { id: to.id } });
    expect(fromAfter.balance).toBe(600n);
    expect(toAfter.balance).toBe(400n);

    const entries = await prisma.ledgerEntry.findMany({ where: { transferId: transfer.id } });
    expect(entries).toHaveLength(2);
    const debit = entries.find((e) => e.direction === 'DEBIT')!;
    const credit = entries.find((e) => e.direction === 'CREDIT')!;
    expect(debit.balanceAfter).toBe(600n);
    expect(credit.balanceAfter).toBe(400n);
  });

  it('saldo insuficiente → lança e faz rollback total', async () => {
    const { from, to } = await twoAccounts(100n);
    await expect(
      executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 500n,
        idempotencyKey: 'k2',
      }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    expect(fromAfter.balance).toBe(100n);
    expect(await prisma.transfer.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('mesma idempotencyKey 2x → uma Transfer, segunda reused', async () => {
    const { from, to } = await twoAccounts(1000n);
    const p = { fromAccountId: from.id, toAccountId: to.id, amount: 200n, idempotencyKey: 'k3' };
    const first = await executeTransfer(p);
    const second = await executeTransfer(p);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.transfer.id).toBe(first.transfer.id);
    expect(await prisma.transfer.count()).toBe(1);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    expect(fromAfter.balance).toBe(800n);
  });
});
