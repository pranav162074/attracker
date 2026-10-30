import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a postgres:// connection string'),
  DIRECT_URL: z.string().url().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:8081,http://localhost:4000')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(60),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

const values = parsed.data;

export const env = {
  nodeEnv: values.NODE_ENV,
  isProduction: values.NODE_ENV === 'production',
  isTest: values.NODE_ENV === 'test',
  port: values.PORT,
  logLevel: values.LOG_LEVEL,
  databaseUrl: values.DATABASE_URL,
  directUrl: values.DIRECT_URL ?? values.DATABASE_URL,
  dbPoolMax: values.DB_POOL_MAX,
  trustProxy: values.TRUST_PROXY,
  allowedOrigins: new Set(values.ALLOWED_ORIGINS.map((origin) => new URL(origin).origin)),
  sessionDays: values.SESSION_DAYS,
};
