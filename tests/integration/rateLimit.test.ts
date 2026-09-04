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
    const responses = [];
    for (let i = 0; i < 4; i += 1) {
      responses.push(await request(app).post('/auth/login').send(body));
    }
    const blocked = responses[3];
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(blocked.body.error.requestId).toEqual(expect.any(String));
  });

  it('/transfers: 5ª chamada → 429 (TRANSFER_RATE_MAX=4)', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const from = await makeAccount(alice.id, 100000n);
    const to = await makeAccount(bob.id, 0n);
    const responses = [];
    for (let i = 0; i < 5; i += 1) {
      responses.push(
        await request(app)
          .post('/transfers')
          .set(authHeaderFor(alice))
          .set('Idempotency-Key', `rl-${i}`)
          .send({ fromAccountId: from.id, toAccountId: to.id, amount: 10 }),
      );
    }
    const blocked = responses[4];
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(blocked.body.error.requestId).toEqual(expect.any(String));
    expect(responses.slice(0, 4).every((r) => r.status === 201)).toBe(true);
  });
});
