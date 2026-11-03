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
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, 'must be Google OAuth client IDs ending in .apps.googleusercontent.com'))),
  PROXY_SECRET: z.union([z.literal(''), z.string().trim().min(32, 'must be at least 32 characters')]).default(''),
  EMAIL_TRANSPORT: z.enum(['log', 'brevo', 'resend']).default('log'),
  EMAIL_API_KEY: z.string().trim().default(''),
  EMAIL_FROM: z.union([z.literal(''), z.email({ error: 'must be the email address reset codes are sent from' })]).default(''),
  EMAIL_FROM_NAME: z.string().trim().min(1).max(60).default('attracker'),
}).superRefine((values, ctx) => {
  if (values.EMAIL_TRANSPORT === 'log') return;
  if (!values.EMAIL_API_KEY) ctx.addIssue({ code: 'custom', path: ['EMAIL_API_KEY'], message: `is required when EMAIL_TRANSPORT is ${values.EMAIL_TRANSPORT}` });
  if (!values.EMAIL_FROM) ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: `is required when EMAIL_TRANSPORT is ${values.EMAIL_TRANSPORT}` });
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
  googleClientIds: values.GOOGLE_CLIENT_IDS,
  proxySecret: values.PROXY_SECRET,
  email: {
    transport: values.EMAIL_TRANSPORT,
    apiKey: values.EMAIL_API_KEY,
    from: values.EMAIL_FROM,
    fromName: values.EMAIL_FROM_NAME,
  },
};
