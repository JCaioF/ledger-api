import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { executeTransfer } from '../../src/modules/transfers/transfer.service.js';
import { InsufficientFundsError, ValidationError } from '../../src/domain/errors.js';
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

  it('mesma conta nos dois lados → lança ValidationError e não cria dinheiro', async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, 1000n);

    await expect(
      executeTransfer({
        fromAccountId: account.id,
        toAccountId: account.id,
        amount: 500n,
        idempotencyKey: 'self',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.balance).toBe(1000n);
    expect(await prisma.transfer.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('amount negativo → lança ValidationError e não move saldo', async () => {
    const { from, to } = await twoAccounts(1000n);

    await expect(
      executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: -100n,
        idempotencyKey: 'neg',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    const toAfter = await prisma.account.findUniqueOrThrow({ where: { id: to.id } });
    expect(fromAfter.balance).toBe(1000n);
    expect(toAfter.balance).toBe(0n);
    expect(await prisma.transfer.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('amount zero → lança ValidationError e não cria Transfer no-op', async () => {
    const { from, to } = await twoAccounts(1000n);

    await expect(
      executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 0n,
        idempotencyKey: 'zero',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    const toAfter = await prisma.account.findUniqueOrThrow({ where: { id: to.id } });
    expect(fromAfter.balance).toBe(1000n);
    expect(toAfter.balance).toBe(0n);
    expect(await prisma.transfer.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });
});
