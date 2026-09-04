import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { makeUser, makeAccount } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/authFor.js';

const app = buildApp();

describe('rate limiting', () => {
  it('/auth/login: 4ª tentativa em 1 min → 429 (AUTH_RATE_MAX=3)', async () => {
    const body = { email: 'rl@test.local', password: 'password123' };
    await request(app).post('/auth/register').send(body);
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/auth/login').send(body);
      codes.push(res.status);
    }
    expect(codes[3]).toBe(429);
  });

  it('/transfers: 5ª chamada → 429 (TRANSFER_RATE_MAX=4)', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const from = await makeAccount(alice.id, 100000n);
    const to = await makeAccount(bob.id, 0n);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/transfers')
        .set(authHeaderFor(alice))
        .set('Idempotency-Key', `rl-${i}`)
        .send({ fromAccountId: from.id, toAccountId: to.id, amount: 10 });
      statuses.push(res.status);
    }
    expect(statuses[4]).toBe(429);
    expect(statuses.slice(0, 4).every((s) => s === 201)).toBe(true);
  });
});
