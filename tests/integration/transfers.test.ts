import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { makeUser, makeAccount } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/authFor.js';

const app = buildApp();

async function scenario() {
  const alice = await makeUser();
  const bob = await makeUser();
  const from = await makeAccount(alice.id, 1000n);
  const to = await makeAccount(bob.id, 0n);
  return { alice, bob, from, to };
}

describe('POST /transfers', () => {
  it('transferência válida → 201, saldos movem', async () => {
    const { alice, from, to } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .set('Idempotency-Key', 'tx-1')
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 300 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: '300', status: 'COMPLETED' });
  });

  it('sem Idempotency-Key → 400', async () => {
    const { alice, from, to } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    expect(res.status).toBe(400);
  });

  it('saldo insuficiente → 422', async () => {
    const { alice, from, to } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .set('Idempotency-Key', 'tx-2')
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 999999 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('origem = destino → 400', async () => {
    const { alice, from } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .set('Idempotency-Key', 'tx-3')
      .send({ fromAccountId: from.id, toAccountId: from.id, amount: 100 });
    expect(res.status).toBe(400);
  });

  it('origem não é do usuário → 403', async () => {
    const { bob, from, to } = await scenario();
    const res = await request(app)
      .post('/transfers')
      .set(authHeaderFor(bob))
      .set('Idempotency-Key', 'tx-4')
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    expect(res.status).toBe(403);
  });
});

describe('GET /transfers/:id', () => {
  it('participante vê a transferência → 200', async () => {
    const { alice, from, to } = await scenario();
    const created = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .set('Idempotency-Key', 'tx-5')
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    const res = await request(app).get(`/transfers/${created.body.id}`).set(authHeaderFor(alice));
    expect(res.status).toBe(200);
  });

  it('estranho → 403', async () => {
    const { alice, from, to } = await scenario();
    const stranger = await makeUser();
    const created = await request(app)
      .post('/transfers')
      .set(authHeaderFor(alice))
      .set('Idempotency-Key', 'tx-6')
      .send({ fromAccountId: from.id, toAccountId: to.id, amount: 100 });
    const res = await request(app)
      .get(`/transfers/${created.body.id}`)
      .set(authHeaderFor(stranger));
    expect(res.status).toBe(403);
  });
});
