import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

const app = buildApp();

describe('POST /auth/register', () => {
  it('cria usuário e retorna 201 sem passwordHash', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@test.local', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@test.local', role: 'USER' });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('email duplicado → 409', async () => {
    const body = { email: 'dupe@test.local', password: 'password123' };
    await request(app).post('/auth/register').send(body);
    const res = await request(app).post('/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('dois registros simultâneos do mesmo e-mail → 201 + 409, nunca 500', async () => {
    const body = { email: 'race@test.local', password: 'password123' };
    const send = () => request(app).post('/auth/register').send(body);

    // Construídas antes de qualquer await: as duas passam pelo `findUnique` de
    // pre-check antes de qualquer `create` terminar, então a perdedora bate na
    // unique de `User.email` (P2002). Sem o catch de P2002 no service isso vira
    // 500. AUTH_RATE_MAX=3 no .env.test, então 2 chamadas não dão 429.
    const settled = await Promise.allSettled([send(), send()]);

    expect(settled.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const statuses = settled.map(
      (r) => (r as PromiseFulfilledResult<{ status: number }>).value.status,
    );

    expect(statuses).not.toContain(500);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(1);
  });

  it('senha curta → 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'x@test.local', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('credenciais corretas → 200 com token', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'log@test.local', password: 'password123' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'log@test.local', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('senha errada → 401', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'log2@test.local', password: 'password123' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'log2@test.local', password: 'wrongpass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_ERROR');
  });
});
