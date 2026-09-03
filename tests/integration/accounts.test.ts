import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { makeUser } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/authFor.js';

const app = buildApp();

describe('accounts', () => {
  it('POST /accounts cria conta com balance "0"', async () => {
    const user = await makeUser();
    const res = await request(app).post('/accounts').set(authHeaderFor(user));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: user.id, balance: '0', currency: 'BRL' });
  });

  it('GET própria conta → 200', async () => {
    const user = await makeUser();
    const created = await request(app).post('/accounts').set(authHeaderFor(user));
    const res = await request(app).get(`/accounts/${created.body.id}`).set(authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('GET conta de outro usuário → 403', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const created = await request(app).post('/accounts').set(authHeaderFor(owner));
    const res = await request(app).get(`/accounts/${created.body.id}`).set(authHeaderFor(other));
    expect(res.status).toBe(403);
  });

  it('GET conta inexistente → 404', async () => {
    const user = await makeUser();
    const res = await request(app).get('/accounts/nope').set(authHeaderFor(user));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('sem token → 401', async () => {
    const res = await request(app).post('/accounts');
    expect(res.status).toBe(401);
  });

  it('ADMIN vê conta de qualquer um → 200', async () => {
    const owner = await makeUser();
    const admin = await makeUser(undefined, 'ADMIN');
    const created = await request(app).post('/accounts').set(authHeaderFor(owner));
    const res = await request(app).get(`/accounts/${created.body.id}`).set(authHeaderFor(admin));
    expect(res.status).toBe(200);
  });
});
