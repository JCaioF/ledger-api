import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { makeUser, makeAccount } from '../helpers/factories.js';
import { executeTransfer } from '../../src/modules/transfers/transfer.service.js';
import { authHeaderFor } from '../helpers/authFor.js';

const app = buildApp();

describe('GET /accounts/:id/statement', () => {
  it('pagina 25 lançamentos em 20 + 5', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const from = await makeAccount(alice.id, 100000n);
    const to = await makeAccount(bob.id, 0n);
    for (let i = 0; i < 25; i += 1) {
      await executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 10n,
        idempotencyKey: `s-${i}`,
      });
    }

    const p1 = await request(app).get(`/accounts/${from.id}/statement`).set(authHeaderFor(alice));
    expect(p1.status).toBe(200);
    expect(p1.body.entries).toHaveLength(20);
    expect(p1.body.nextCursor).toEqual(expect.any(String));

    const p2 = await request(app)
      .get(`/accounts/${from.id}/statement`)
      .query({ cursor: p1.body.nextCursor })
      .set(authHeaderFor(alice));
    expect(p2.body.entries).toHaveLength(5);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('limit customizado', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const from = await makeAccount(alice.id, 100000n);
    const to = await makeAccount(bob.id, 0n);
    for (let i = 0; i < 5; i += 1) {
      await executeTransfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 10n,
        idempotencyKey: `l-${i}`,
      });
    }
    const res = await request(app)
      .get(`/accounts/${from.id}/statement`)
      .query({ limit: 2 })
      .set(authHeaderFor(alice));
    expect(res.body.entries).toHaveLength(2);
  });

  it('não-dono → 403', async () => {
    const alice = await makeUser();
    const other = await makeUser();
    const acc = await makeAccount(alice.id, 0n);
    const res = await request(app).get(`/accounts/${acc.id}/statement`).set(authHeaderFor(other));
    expect(res.status).toBe(403);
  });

  it('limit inválido → 400', async () => {
    const alice = await makeUser();
    const acc = await makeAccount(alice.id, 0n);
    const res = await request(app)
      .get(`/accounts/${acc.id}/statement`)
      .query({ limit: 999 })
      .set(authHeaderFor(alice));
    expect(res.status).toBe(400);
  });
});
