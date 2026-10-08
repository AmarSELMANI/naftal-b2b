// Fastify assembly. Kept separate from server.js so tests can build an app
// without binding a port.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { env } from './config/env.js';
import { registerErrorHandler } from './lib/errors.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import healthRoutes from './modules/health/health.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import orderRoutes from './modules/orders/orders.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import { sweepDueReminders } from './modules/notifications/notifications.service.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.isProd ? 'info' : 'debug',
      // pino-pretty only in dev; production wants machine-readable JSON
      transport: env.isProd ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    // Only trust X-Forwarded-For when something is actually in front of us.
    // Trusting it unconditionally lets a direct client forge the header and get
    // a brand-new rate-limit bucket on every request, which silently defeats
    // the brute-force protection on /auth/login.
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576, // 1 MB — file bytes go straight to R2, never through here
  });

  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    // Helmet defaults Cross-Origin-Resource-Policy to same-origin, which blocks
    // the mobile app and admin panel from loading product images at all (the
    // browser refuses with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). This service
    // is a public API serving public catalog images to clients on other origins,
    // so cross-origin is the correct policy. Access control for anything
    // sensitive is CORS plus the auth hook, never CORP -- and KYC documents stay
    // locked behind the staff-only streaming route regardless. §6
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(compress, { global: true, encodings: ['br', 'gzip'] });
  // Fail CLOSED in production. `origin: true` reflects whatever Origin the
  // caller sends, which means any website could call this API with a logged-in
  // user's credentials. Convenient in development, unacceptable deployed, so an
  // empty allowlist is a boot failure rather than a wildcard.
  if (env.isProd && env.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set in production (refusing to allow all origins)');
  }
  await app.register(cors, {
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
  });
  await app.register(rateLimit, {
    global: false, // opted into per route; /auth/* is the one that needs it
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // Phase 0 serves the app's existing assets/ folder so the seeded image_urls
  // resolve with no upload step. At deploy time these move to R2's CDN and only
  // PUBLIC_ASSET_BASE_URL changes. The immutable cache header is safe because
  // these filenames never change content. §5.9
  await app.register(fastifyStatic, {
    root: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets'),
    prefix: '/static/',
    cacheControl: true,
    maxAge: '365d',
    immutable: true,
    decorateReply: false,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Naftal B2B API',
        description: 'Tires & lubricants ordering with company credit accounts.',
        version: '0.1.0',
      },
      servers: [{ url: '/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  // Browsable docs are genuinely useful, but they publish the whole API surface
  // and are served by swagger-ui's own static handler. Off by default in
  // production; set ENABLE_DOCS=true to turn them back on deliberately.
  if (!env.isProd || env.ENABLE_DOCS) {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  // Everything lives under /v1 so a breaking change can ship as /v2 alongside.
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes);
      await v1.register(onboardingRoutes);
      await v1.register(catalogRoutes);
      await v1.register(orderRoutes);
      await v1.register(notificationRoutes);
      await v1.register(adminRoutes);
    },
    { prefix: '/v1' },
  );

  // Deadline reminders are the one thing that cannot be computed on read (§5.7),
  // because there is no reader to compute them for. A plain interval is enough
  // for one machine, and the sweep is idempotent per order per day, so a restart
  // cannot double-notify. On more than one instance this would want a real
  // scheduler or a Postgres advisory lock so only one node sweeps.
  if (env.NODE_ENV !== 'test') {
    const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 4x a day; dedupe makes the extra runs free
    const timer = setInterval(() => {
      sweepDueReminders(app).catch((err) => app.log.error({ err }, 'due sweep failed'));
    }, SWEEP_INTERVAL_MS);
    timer.unref(); // never hold the process open
    app.addHook('onClose', async () => clearInterval(timer));
  }

  return app;
}
