import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

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
