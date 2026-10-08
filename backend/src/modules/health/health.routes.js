// Two separate endpoints, because they answer different questions:
//   /health  — is the process alive?        (the keep-warm ping hits this)
//   /ready   — can it actually serve?       (is the database reachable?)
// Conflating them makes a load balancer kill a healthy process during a brief
// database blip. §7

export default async function healthRoutes(app) {
  app.get(
    '/health',
    { schema: { tags: ['ops'], summary: 'Liveness — no dependencies touched' } },
    async () => ({ status: 'ok', uptime: Math.round(process.uptime()) }),
  );

  app.get(
    '/ready',
    { schema: { tags: ['ops'], summary: 'Readiness — verifies the database' } },
    async (req, reply) => {
      const started = Date.now();
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        return { status: 'ready', dbLatencyMs: Date.now() - started };
      } catch (err) {
        req.log.error({ err }, 'readiness check failed');
        return reply.code(503).send({
          error: { code: 'DB_UNREACHABLE', message: 'Database is not reachable' },
        });
      }
    },
  );
}
