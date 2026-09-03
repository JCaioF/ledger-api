import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { makeUser } from '../helpers/factories.js';
import { authHeaderFor } from '../helpers/authFor.js';

const app = buildApp();

describe('authMiddleware', () => {
  it('sem token → 401', async () => {
    const res = await request(app).get('/__me');
    expect(res.status).toBe(401);
  });

  it('token inválido → 401', async () => {
    const res = await request(app).get('/__me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('token válido → 200 com auth context', async () => {
    const user = await makeUser();
    const res = await request(app).get('/__me').set(authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: user.id, role: 'USER' });
  });
});

describe('requireRole', () => {
  it('USER em rota ADMIN → 403', async () => {
    const user = await makeUser();
    const res = await request(app).get('/__admin').set(authHeaderFor(user));
    expect(res.status).toBe(403);
  });

  it('ADMIN em rota ADMIN → 200', async () => {
    const admin = await makeUser(undefined, 'ADMIN');
    const res = await request(app).get('/__admin').set(authHeaderFor(admin));
    expect(res.status).toBe(200);
  });
});
