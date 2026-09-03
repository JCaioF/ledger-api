import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { makeUser, makeAccount, makeTreasury } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/authFor.js';
import { TREASURY_ACCOUNT_ID } from '../../src/config/constants.js';

const app = buildApp();

describe('POST /accounts/:id/deposits', () => {
  it('admin deposita → 201, saldo sobe, treasury fica negativa', async () => {
    await makeTreasury();
    const admin = await makeUser(undefined, 'ADMIN');
    const user = await makeUser();
    const account = await makeAccount(user.id, 0n);

    const res = await request(app)
      .post(`/accounts/${account.id}/deposits`)
      .set(authHeaderFor(admin))
      .send({ amount: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe('5000');

    const acc = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    const treasury = await prisma.account.findUniqueOrThrow({ where: { id: TREASURY_ACCOUNT_ID } });
    expect(acc.balance).toBe(5000n);
    expect(treasury.balance).toBe(-5000n);
  });

  it('não-admin → 403', async () => {
    await makeTreasury();
    const user = await makeUser();
    const account = await makeAccount(user.id, 0n);
    const res = await request(app)
      .post(`/accounts/${account.id}/deposits`)
      .set(authHeaderFor(user))
      .send({ amount: 100 });
    expect(res.status).toBe(403);
  });

  it('conta inexistente → 404', async () => {
    await makeTreasury();
    const admin = await makeUser(undefined, 'ADMIN');
    const res = await request(app)
      .post('/accounts/nope/deposits')
      .set(authHeaderFor(admin))
      .send({ amount: 100 });
    expect(res.status).toBe(404);
  });

  it('amount inválido → 400', async () => {
    await makeTreasury();
    const admin = await makeUser(undefined, 'ADMIN');
    const user = await makeUser();
    const account = await makeAccount(user.id, 0n);
    const res = await request(app)
      .post(`/accounts/${account.id}/deposits`)
      .set(authHeaderFor(admin))
      .send({ amount: -1 });
    expect(res.status).toBe(400);
  });
});
