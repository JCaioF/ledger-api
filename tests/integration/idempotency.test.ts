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

  it('sem header → 400', async () => {
    const { alice, from, to } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    expect(res.status).toBe(400);
  });
});
