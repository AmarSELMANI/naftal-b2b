// Prisma as a Fastify plugin, so every route reaches the same client through
// `app.prisma` and the pool is closed exactly once on shutdown.
//
// One client per process is deliberate: on Neon's pooled endpoint each client
// holds its own PgBouncer connections, and a second client would silently
// double the footprint against a free-tier limit. §5.8
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export default fp(async function prismaPlugin(app) {
  const prisma = new PrismaClient({
    log: app.log.level === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  await prisma.$connect();

  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
