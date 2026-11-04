import { Writable } from 'node:stream';
import { describe, it, expect } from 'vitest';
import { pino } from 'pino';
import { REDACTED } from '../src/config/logger.ts';

describe('request logs', () => {
  it('never print tokens, cookies or the forwarder secret', () => {
    const lines: string[] = [];
    const out = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    pino({ redact: REDACTED }, out).info({
      req: { headers: { authorization: 'Bearer at_secret', cookie: 'attracker_session=at_secret', 'x-attracker-proxy': 'forwarder-secret', 'x-attracker-client-ip': '203.0.113.9' } },
      res: { headers: { 'set-cookie': 'attracker_session=at_secret' } },
    });
    const text = lines.join('');
    expect(text).not.toContain('at_secret');
    expect(text).not.toContain('forwarder-secret');
    expect(text).toContain('203.0.113.9');
  });
});
