const SAFE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/attracker_test';
delete process.env.DIRECT_URL;

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
})();

if (!SAFE_HOSTS.has(host)) {
  throw new Error('Refusing to run tests: DATABASE_URL must point at a local or CI database, because tests create and delete data.');
}
