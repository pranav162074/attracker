import { describe, it, expect } from 'vitest';
import { resolveApiUrl } from '../src/lib/apiUrl.ts';

describe('finding the API', () => {
  it('uses the configured address when there is one', () => {
    expect(resolveApiUrl({ configured: 'https://attracker-api.onrender.com/', platform: 'android', dev: false })).toBe('https://attracker-api.onrender.com');
    expect(resolveApiUrl({ configured: '  ', platform: 'web', dev: false })).toBe('/api');
  });

  it('talks to the API on the same computer as the dev server, from the phone', () => {
    expect(resolveApiUrl({ platform: 'android', dev: true, hostUri: '192.168.1.7:8081' })).toBe('http://192.168.1.7:4000');
    expect(resolveApiUrl({ platform: 'android', dev: true, hostUri: 'exp://192.168.1.7:8081/--/' })).toBe('http://192.168.1.7:4000');
  });

  it('uses localhost in the browser during development and the same site in production', () => {
    expect(resolveApiUrl({ platform: 'web', dev: true })).toBe('http://localhost:4000');
    expect(resolveApiUrl({ platform: 'web', dev: false })).toBe('/api');
  });

  it('has no answer for a release phone build without a configured address', () => {
    expect(resolveApiUrl({ platform: 'android', dev: false, hostUri: '192.168.1.7:8081' })).toBeNull();
    expect(resolveApiUrl({ platform: 'android', dev: true, hostUri: null })).toBeNull();
  });
});
