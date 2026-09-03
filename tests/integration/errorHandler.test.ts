import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

const app = buildApp();

describe('errorHandler + notFound', () => {
  it('rota inexistente → 404 no formato padrão', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('AppError lançado → status e code do erro', async () => {
    const res = await request(app).get('/__boom');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('erro genérico → 500 com corpo genérico', async () => {
    const res = await request(app).get('/__crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).toBe('Internal server error');
  });
});
