import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { parse } from 'yaml';
import { buildApp } from '../../src/app.js';

const app = buildApp();

describe('openapi', () => {
  it('GET /openapi.yaml serve um doc válido com os paths principais', async () => {
    const res = await request(app).get('/openapi.yaml');
    expect(res.status).toBe(200);
    const doc = parse(res.text);
    expect(doc.openapi).toMatch(/^3\./);
    for (const p of ['/auth/login', '/accounts', '/transfers', '/health']) {
      expect(doc.paths[p]).toBeDefined();
    }
  });

  it('GET /docs responde HTML', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
