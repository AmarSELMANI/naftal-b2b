// Entry point. Loads .env, builds the app, binds the port, and shuts down
// cleanly so in-flight orders are never cut mid-transaction.

import 'node:process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Minimal .env loader — Node 22 has --env-file, but loading it here means
// `node src/server.js` works without remembering the flag.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue; // real env always wins
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

const { env } = await import('./config/env.js');
const { buildApp } = await import('./app.js');

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`docs on http://localhost:${env.PORT}/docs`);
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, draining`);
    await app.close(); // finishes in-flight requests, then disconnects Prisma
    process.exit(0);
  });
}
