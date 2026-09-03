import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
