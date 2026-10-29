import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { closePool } from '../src/db/pool.ts';
import { skipWithoutDatabase } from './db.ts';

afterAll(() => closePool());

describe('the API', () => {
  it('answers the health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('gives every response a request id, keeping a safe one the client sent', async () => {
    const generated = await request(app).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const kept = await request(app).get('/health').set('X-Request-Id', 'trace-123');
    expect(kept.headers['x-request-id']).toBe('trace-123');

    const replaced = await request(app).get('/health').set('X-Request-Id', 'bad id <script>');
    expect(replaced.headers['x-request-id']).not.toBe('bad id <script>');
  });

  it('answers unknown routes with JSON 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('treats a malformed JSON body as the client\'s mistake', async () => {
    const res = await request(app).post('/health').set('Content-Type', 'application/json').send('{"broken"');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });

  it('sends the usual security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it.skipIf(skipWithoutDatabase)('reports ready when the database answers', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});
