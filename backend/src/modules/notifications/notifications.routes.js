import { badRequest } from '../../lib/errors.js';
import { isExpoPushToken, sweepDueReminders } from './notifications.service.js';

export default async function notificationRoutes(app) {
  /**
   * Register this device for push.
   *
   * Reachable with an onboarding scope on purpose: the most valuable push in the
   * whole system is "your account is approved", and the applicant is by
   * definition not yet approved when they need to register for it.
   */
  app.post(
    '/devices',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['notifications'],
        summary: 'Register an Expo push token for this device',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', maxLength: 200 },
            platform: { type: 'string', enum: ['ios', 'android', 'web'] },
            language: { type: 'string', enum: ['fr', 'en'] },
          },
        },
      },
    },
    async (req) => {
      const { token, platform, language } = req.body;
      if (!isExpoPushToken(token)) {
        throw badRequest('INVALID_PUSH_TOKEN', 'Not an Expo push token');
      }

      // A token can move between users: the same phone, a different login. The
      // upsert reassigns it rather than leaving the previous user receiving
      // notifications meant for someone else.
      await app.prisma.deviceToken.upsert({
        where: { expoPushToken: token },
        update: {
          userId: req.auth.userId,
          platform: platform ?? null,
          language: language ?? 'fr',
          lastSeenAt: new Date(),
        },
        create: {
          userId: req.auth.userId,
          expoPushToken: token,
          platform: platform ?? null,
          language: language ?? 'fr',
        },
      });

      return { registered: true };
    },
  );

  app.delete(
    '/devices',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['notifications'],
        summary: 'Unregister this device (called on logout)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req) => {
      await app.prisma.deviceToken.deleteMany({
        where: { expoPushToken: req.body.token, userId: req.auth.userId },
      });
      return { unregistered: true };
    },
  );

  /** In-app notification history, so a missed push is never a lost message. */
  app.get(
    '/notifications',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['notifications'],
        summary: 'My notifications, newest first',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 } },
        },
      },
    },
    async (req) => {
      const rows = await app.prisma.notification.findMany({
        where: { userId: req.auth.userId },
        orderBy: { createdAt: 'desc' },
        take: req.query.limit ?? 30,
      });
      return {
        items: rows.map((n) => ({
          id: n.id,
          type: n.type,
          // Both languages, so switching language does not refetch. §4.1
          title: { fr: n.titleFr, en: n.titleEn },
          body: { fr: n.bodyFr, en: n.bodyEn },
          data: n.data,
          readAt: n.readAt,
          createdAt: n.createdAt,
        })),
        unread: rows.filter((n) => !n.readAt).length,
      };
    },
  );

  app.post(
    '/notifications/read',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['notifications'],
        summary: 'Mark notifications read',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 100 },
          },
        },
      },
    },
    async (req) => {
      const where = { userId: req.auth.userId, readAt: null };
      if (req.body?.ids?.length) where.id = { in: req.body.ids };
      const { count } = await app.prisma.notification.updateMany({
        where,
        data: { readAt: new Date() },
      });
      return { marked: count };
    },
  );

  /** Manual trigger for the deadline sweep — handy for a demo, staff only. */
  app.post(
    '/admin/notifications/sweep',
    {
      onRequest: app.requireRole('agent', 'admin'),
      schema: {
        tags: ['admin'],
        summary: 'Run the due-date reminder sweep now (idempotent)',
        security: [{ bearerAuth: [] }],
      },
    },
    async () => sweepDueReminders(app),
  );
}
