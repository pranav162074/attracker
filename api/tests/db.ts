import pg from 'pg';

const probe = async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    const { rows } = await client.query<{ ok: boolean }>("SELECT to_regclass('public.users') IS NOT NULL AS ok");
    return rows[0]?.ok === true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
};

export const databaseReady = await probe();

export const skipWithoutDatabase = !databaseReady && !process.env.CI;

if (skipWithoutDatabase) {
  console.warn('Database tests skipped: no migrated local Postgres at DATABASE_URL. CI always runs them.');
}
