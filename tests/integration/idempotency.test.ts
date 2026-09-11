import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { makeUser, makeAccount } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/authFor.js';

const app = buildApp();

async function scenario() {
  const alice = await makeUser();
  const bob = await makeUser();
  const from = await makeAccount(alice.id, 1000n);
  const to = await makeAccount(bob.id, 0n);
  return { alice, from, to };
}

describe('idempotency middleware', () => {
  it('mesma key 2x → mesmo status, corpo idêntico e uma Transfer', async () => {
    const { alice, from, to } = await scenario();
    const send = () =>
      request(app)
        .post('/transfers')
        .set(authHeaderFor(alice))
        .set('Idempotency-Key', 'same-key')
        .send({ fromAccountId: from.id, toAccountId: to.id, amount: 250 });

    const first = await send();
    const second = await send();

    expect(first.status).toBe(201);
    // Genuine middleware-specific assertion: without the middleware, the
    // second call reaches the controller and returns 200 (reused=true).
    // With the middleware, the second call is served from the Redis cache
    // with the FIRST call's stored status, so it is 201 (same as first).
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(await prisma.transfer.count()).toBe(1);

    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    expect(fromAfter.balance).toBe(750n);
  });

  it('keys diferentes → duas Transfers', async () => {
    const { alice, from, to } = await scenario();
    for (const key of ['k-a', 'k-b']) {
      await request(app)
        .post('/transfers')
        .set(authHeaderFor(alice))
        .set('Idempotency-Key', key)
        .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    }
    expect(await prisma.transfer.count()).toBe(2);
  });

  it('duas requisições genuinamente paralelas com a mesma key → o dinheiro sai uma vez só', async () => {
    const { alice, from, to } = await scenario();
    const send = () =>
      request(app)
        .post('/transfers')
        .set(authHeaderFor(alice))
        .set('Idempotency-Key', 'parallel-key')
        .send({ fromAccountId: from.id, toAccountId: to.id, amount: 250 });

    // As duas chamadas são construídas antes de qualquer await e só então
    // aguardadas em conjunto — é isso que faz a corrida ser real e exercita o
    // ramo do lock Redis (`SET ... NX` perdido → 409) pela porta HTTP inteira.
    const settled = await Promise.allSettled([send(), send()]);

    expect(settled.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const responses = settled.map(
      (r) =>
        (r as PromiseFulfilledResult<{ status: number; body: { error?: { code?: string } } }>)
          .value,
    );
    const statuses = responses.map((r) => r.status);

    // TRANSFER_RATE_MAX=4 no .env.test: duas chamadas não estouram o limite.
    expect(statuses).not.toContain(429);
    // Quem ganha o lock processa (201). A outra pode: perder o SETNX (409),
    // achar a resposta já cacheada (201 replay) ou escapar do Redis e reusar a
    // Transfer pela unique do banco (200). As três são corretas.
    expect(statuses).toContain(201);
    for (const status of statuses) expect([200, 201, 409]).toContain(status);
    // Se saiu 409, tem que ser o ConflictError do lock — não um 409 de outra origem.
    for (const res of responses.filter((r) => r.status === 409)) {
      expect(res.body.error?.code).toBe('CONFLICT');
    }

    // A invariante que de fato importa, independente de qual combinação saiu:
    // uma única Transfer, um único débito.
    expect(await prisma.transfer.count()).toBe(1);
    const fromAfter = await prisma.account.findUniqueOrThrow({ where: { id: from.id } });
    expect(fromAfter.balance).toBe(750n);
  });

  it('sem header → 400', async () => {
    const { alice, from, to } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    expect(res.status).toBe(400);
  });
});
