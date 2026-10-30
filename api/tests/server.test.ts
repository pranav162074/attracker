import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { skipWithoutDatabase } from './db.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });

const startServer = async (extraEnv: Record<string, string> = {}) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.ts'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), LOG_LEVEL: 'silent', ...extraEnv },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  let healthy = false;
  for (let i = 0; i < 100 && !healthy; i += 1) {
    try {
      healthy = (await fetch(`http://127.0.0.1:${port}/health`)).ok;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { child, healthy, port, output: () => stderr };
};

const exitOf = (child: ChildProcess) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );

const createdEmails: string[] = [];
const testIp = `10.251.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

afterAll(async () => {
  if (createdEmails.length === 0) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
  await client.query('DELETE FROM rate_limit_windows WHERE key = $1', [testIp]);
  await client.end();
});

describe('the server process', () => {
  it('runs the TypeScript source directly with Node', async () => {
    const { child, healthy, output } = await startServer();
    const exit = exitOf(child);
    child.kill();
    await exit;
    expect(healthy, output()).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('stops cleanly on SIGTERM, as Render sends on every deploy', async () => {
    const { child, healthy, output } = await startServer();
    expect(healthy, output()).toBe(true);
    const exit = exitOf(child);
    child.kill('SIGTERM');
    expect(await exit).toEqual({ code: 0, signal: null });
  });

  it('stays alive and says so when the database is unreachable', async () => {
    const deadPort = await freePort();
    const { child, healthy, port, output } = await startServer({ DATABASE_URL: `postgresql://nobody@127.0.0.1:${deadPort}/none` });
    try {
      expect(healthy, output()).toBe(true);
      const ready = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: 'unavailable', database: 'unreachable' });
    } finally {
      const exit = exitOf(child);
      child.kill();
      await exit;
    }
  });

  it.skipIf(skipWithoutDatabase)('marks the session cookie Secure in production', async () => {
    const { child, healthy, port, output } = await startServer();
    try {
      expect(healthy, output()).toBe(true);
      const email = `secure-${randomUUID()}@example.com`;
      createdEmails.push(email);
      const res = await fetch(`http://127.0.0.1:${port}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
        body: JSON.stringify({ email, password: 'correct horse battery' }),
      });
      expect(res.status).toBe(201);
      expect(res.headers.get('set-cookie')).toMatch(/;\s*Secure/i);
    } finally {
      const exit = exitOf(child);
      child.kill();
      await exit;
    }
  });

  it('loads the shared engine package as TypeScript, without a build step', async () => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', "import { formatPercent, percentHundredths } from '@attracker/engine'; console.log(formatPercent(percentHundredths(150, 246)))"],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    expect(code, stderr).toBe(0);
    expect(stdout.trim()).toBe('60.97');
  });

  it('refuses to start with an invalid setting', async () => {
    const child = spawn(process.execPath, ['src/server.ts'], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'production', PORT: 'not-a-port' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    expect(code).toBe(1);
    expect(stderr).toContain('PORT');
  });
});
