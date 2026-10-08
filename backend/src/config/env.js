// Environment is validated once, at boot. A missing secret must crash the
// process immediately — never surface as `undefined` inside a JWT call.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Auth rate limits. The defaults are the production values; they exist as env
  // vars so an end-to-end suite can register more than five companies in ten
  // minutes without the limiter -- correctly -- refusing it.
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_REGISTER_WINDOW: z.string().default('10 minutes'),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_WINDOW: z.string().default('5 minutes'),

  CORS_ORIGINS: z.string().default(''),
  // Set true only when a proxy (Fly, Render, nginx) terminates TLS in front of
  // the app. See the note in app.js about forged X-Forwarded-For.
  TRUST_PROXY: z.coerce.boolean().default(false),
  ENABLE_DOCS: z.coerce.boolean().default(false),
  PUBLIC_ASSET_BASE_URL: z.string().default('http://localhost:3100/static'),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_DOCUMENTS: z.string().default('naftal-documents'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => '  - ' + i.path.join('.') + ': ' + i.message)
    .join('\n');
  console.error('\nInvalid environment:\n' + issues + '\n\nCopy .env.example to .env and fill it in.\n');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};
