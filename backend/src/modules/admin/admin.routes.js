// Naftal staff routes: the approval queue, document review, and credit policy.

import { notFound, badRequest } from '../../lib/errors.js';
import { publishAccountDecision } from '../../lib/events.js';
import { audit, ACTIONS } from '../../lib/audit.js';
import { getSettings, invalidateSettings } from '../../lib/settings.js';
import { getObjectStream } from '../../lib/storage.js';
import { creditStatus } from '../../lib/dates.js';
import { invalidateCatalog } from '../catalog/catalog.service.js';
import { notify, notifyCompany, TYPES } from '../notifications/notifications.service.js';

export default async function adminRoutes(app) {
  const staff = app.requireRole('agent', 'admin');
  const adminOnly = app.requireRole('admin');

  // --- the queue ----------------------------------------------------------
  app.get(
    '/admin/account-requests',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Account requests, newest first',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'approved', 'denied'] },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          },
        },
      },
    },
    async (req) => {
      const rows = await app.prisma.accountRequest.findMany({
        relationLoadStrategy: 'join', // one round trip, not one per relation. §5.11
        where: req.query.status ? { status: req.query.status } : {},
        orderBy: { createdAt: 'desc' },
        take: req.query.limit ?? 25,
        include: {
          company: true,
          submittedBy: { select: { username: true, firstName: true, lastName: true, email: true, phone: true } },
          documents: { select: { kind: true } },
        },
      });

      return {
        items: rows.map((r) => ({
          id: r.id,
          status: r.status,
          submittedAt: r.createdAt,
          decidedAt: r.decidedAt,
          denialReason: r.denialReason,
          company: {
            id: r.company.id,
            name: r.company.name,
            legalForm: r.company.legalForm,
            tin: r.company.tin,
            tradeRegisterNo: r.company.tradeRegisterNo,
            phone: r.company.phone,
            email: r.company.email,
            approvalStatus: r.company.approvalStatus,
          },
          applicant: r.submittedBy,
          documentCount: r.documents.length,
        })),
      };
    },
  );

  app.get(
    '/admin/account-requests/:id',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'One request with its documents',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const r = await app.prisma.accountRequest.findUnique({
        relationLoadStrategy: 'join',
        where: { id: req.params.id },
        include: { company: true, submittedBy: true, documents: true, decidedBy: { select: { username: true } } },
      });
      if (!r) throw notFound('REQUEST_NOT_FOUND', 'No such account request');

      return {
        id: r.id,
        status: r.status,
        submittedAt: r.createdAt,
        termsAcceptedAt: r.termsAcceptedAt,
        decidedAt: r.decidedAt,
        decidedBy: r.decidedBy?.username ?? null,
        denialReason: r.denialReason,
        company: r.company,
        applicant: {
          id: r.submittedBy.id,
          username: r.submittedBy.username,
          firstName: r.submittedBy.firstName,
          lastName: r.submittedBy.lastName,
          email: r.submittedBy.email,
          phone: r.submittedBy.phone,
        },
        documents: r.documents.map((d) => ({
          id: d.id,
          kind: d.kind,
          fileName: d.fileName,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          uploadedAt: d.uploadedAt,
          // Not a public URL. Streams only through the authenticated route below.
          downloadPath: `/v1/admin/documents/${d.id}`,
        })),
      };
    },
  );

  /**
   * Document download. These are ID cards and bank statements, so there is no
   * public path to them: bytes leave only here, behind a staff role check. §6
   */
  app.get(
    '/admin/documents/:id',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Stream a KYC document (staff only, never public)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req, reply) => {
      const doc = await app.prisma.document.findUnique({ where: { id: req.params.id } });
      if (!doc) throw notFound('DOCUMENT_NOT_FOUND', 'No such document');

      // Fetch the bytes BEFORE touching the response, so a missing object is
      // still a clean 404 rather than a 200 with an empty body.
      let stream;
      try {
        stream = await getObjectStream(doc.storageKey);
      } catch {
        throw notFound(
          'DOCUMENT_FILE_MISSING',
          'The document record exists but its file is gone from storage',
        );
      }

      reply
        .header('Content-Type', doc.mimeType)
        .header('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`)
        .header('Cache-Control', 'private, no-store'); // never cached anywhere

      return reply.send(stream);
    },
  );

  // --- decisions ----------------------------------------------------------

  async function decide(req, { approve, reason }) {
    const r = await app.prisma.accountRequest.findUnique({
      where: { id: req.params.id },
      include: { company: true, documents: { select: { kind: true } } },
    });
    if (!r) throw notFound('REQUEST_NOT_FOUND', 'No such account request');
    if (r.status !== 'pending') {
      throw badRequest('ALREADY_DECIDED', `This request was already ${r.status}`);
    }

    const status = approve ? 'approved' : 'denied';
    const now = new Date();

    // Both rows move together: a company must never be left approved with its
    // request still pending, or vice versa.
    await app.prisma.$transaction([
      app.prisma.accountRequest.update({
        where: { id: r.id },
        data: { status, decidedAt: now, decidedById: req.auth.userId, denialReason: approve ? null : reason },
      }),
      app.prisma.company.update({
        where: { id: r.companyId },
        data: { approvalStatus: status },
      }),
    ]);

    audit(app, {
      actorUserId: req.auth.userId,
      action: approve ? ACTIONS.ACCOUNT_APPROVE : ACTIONS.ACCOUNT_DENY,
      entityType: 'account_request',
      entityId: r.id,
      before: { status: r.status },
      after: { status, denialReason: approve ? null : reason },
      ip: req.ip,
    });

    // Wakes the applicant's SSE connection. Their next access token will carry
    // the full scope; the current one keeps its onboarding scope until it
    // expires (15 min) or they refresh — which the app does on seeing this.
    publishAccountDecision(r.companyId, {
      status,
      approvalStatus: status,
      denialReason: approve ? null : reason,
      decidedAt: now,
      companyName: r.company.name,
    });

    // Push as well as SSE: the stream only reaches a phone with the Wait screen
    // open, and most applicants will have closed the app by the time an agent
    // gets to their file.
    notify(app, {
      userId: r.submittedById,
      type: approve ? TYPES.ACCOUNT_APPROVED : TYPES.ACCOUNT_DENIED,
      vars: { name: r.company.name, reason },
      data: { accountRequestId: r.id },
    });

    return { id: r.id, status, decidedAt: now };
  }

  app.post(
    '/admin/account-requests/:id/approve',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Approve an account request',
        description:
          'Takes no credit fields on purpose: the ceiling is Naftal policy in ' +
          'app_settings, not an agent decision. See §3.1.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => decide(req, { approve: true }),
  );

  app.post(
    '/admin/account-requests/:id/deny',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Deny an account request',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } },
        },
      },
    },
    async (req) => decide(req, { approve: false, reason: req.body.reason }),
  );

  // --- stock -------------------------------------------------------------

  /**
   * Adjust stock. Either an absolute `quantity` or a relative `delta`.
   *
   * Audited, because stock is the thing an order consumes and a silent
   * adjustment is indistinguishable from a sale that never happened.
   */
  app.patch(
    '/admin/products/:id/stock',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Set or adjust a product’s stock',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          oneOf: [{ required: ['quantity'] }, { required: ['delta'] }],
          properties: {
            quantity: { type: 'integer', minimum: 0, maximum: 1000000 },
            delta: { type: 'integer', minimum: -1000000, maximum: 1000000 },
          },
        },
      },
    },
    async (req) => {
      const product = await app.prisma.product.findUnique({
        where: { id: req.params.id },
        include: { stock: true },
      });
      if (!product) throw notFound('PRODUCT_NOT_FOUND', 'No such product');

      const before = product.stock?.quantity ?? 0;
      const after = req.body.quantity ?? Math.max(0, before + req.body.delta);

      const row = await app.prisma.productStock.upsert({
        where: { productId: product.id },
        update: { quantity: after },
        create: { productId: product.id, quantity: after },
      });

      // The catalog caches in-stock flags, so it has to be told. §5.2
      invalidateCatalog();

      audit(app, {
        actorUserId: req.auth.userId,
        action: ACTIONS.STOCK_ADJUST,
        entityType: 'product',
        entityId: product.id,
        before: { quantity: before },
        after: { quantity: row.quantity },
        ip: req.ip,
      });

      return { productId: product.id, sku: product.sku, quantity: row.quantity, previous: before };
    },
  );

  // --- orders & payments to action ---------------------------------------

  /**
   * Orders across every company, newest first.
   *
   * `awaitingPayment=true` is the agent's actual working queue: orders with a
   * payment declared but not yet confirmed. Without it, confirming a cheque
   * means knowing a payment id in advance, which is not a workflow.
   */
  app.get(
    '/admin/orders',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'All orders, with their declared payments',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] },
            awaitingPayment: { type: 'boolean' },
            overdue: { type: 'boolean' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const where = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.awaitingPayment) {
        where.payments = { some: { status: 'declared' } };
      }
      if (req.query.overdue) {
        where.paymentType = 'credit';
        where.paymentState = { not: 'paid' };
        where.dueDate = { lt: new Date() };
        where.status = { not: 'cancelled' };
      }

      const rows = await app.prisma.order.findMany({
        relationLoadStrategy: 'join',
        where,
        orderBy: { createdAt: 'desc' },
        take: req.query.limit ?? 50,
        include: {
          company: { select: { id: true, name: true } },
          items: true,
          payments: { orderBy: { declaredAt: 'desc' } },
        },
      });

      return {
        items: rows.map((o) => {
          const credit = creditStatus(o);
          return {
            id: o.id,
            orderNo: o.orderNo,
            company: o.company,
            status: o.status,
            paymentType: o.paymentType,
            paymentState: o.paymentState,
            total: Number(o.total),
            amountPaid: Number(o.amountPaid),
            remaining: Number(o.total) - Number(o.amountPaid),
            dueDate: o.dueDate,
            daysLeft: credit.daysLeft,
            urgency: credit.urgency,
            createdAt: o.createdAt,
            itemCount: o.items.length,
            items: o.items.map((i) => ({
              name: i.nameSnapshot,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              lineTotal: Number(i.lineTotal),
            })),
            payments: o.payments.map((pm) => ({
              id: pm.id,
              method: pm.method,
              amount: Number(pm.amount),
              status: pm.status,
              reference: pm.reference,
              declaredAt: pm.declaredAt,
              confirmedAt: pm.confirmedAt,
            })),
          };
        }),
      };
    },
  );

  // --- payments ----------------------------------------------------------

  /**
   * Confirm receipt of a declared payment.
   *
   * This is the step that actually moves money in the model: until an agent
   * confirms the cheque cleared or the cash arrived, amount_paid does not move
   * and the credit stays consumed. §3.3
   */
  app.post(
    '/admin/payments/:id/confirm',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Confirm a declared payment, freeing the credit it settles',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const payment = await app.prisma.payment.findUnique({
        where: { id: req.params.id },
        include: { order: true },
      });
      if (!payment) throw notFound('PAYMENT_NOT_FOUND', 'No such payment');
      if (payment.status !== 'declared') {
        throw badRequest('ALREADY_RESOLVED', `This payment is already ${payment.status}`);
      }

      const paid = Number(payment.order.amountPaid) + Number(payment.amount);
      const total = Number(payment.order.total);
      // Tolerance of one centime, so floating display rounding cannot leave an
      // order one unit short of "paid" forever.
      const state = paid >= total - 0.01 ? 'paid' : 'partially_paid';

      // Both rows move together: a confirmed payment whose order still reads
      // unpaid would quietly hold the company's credit hostage.
      const [, order] = await app.prisma.$transaction([
        app.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'confirmed', confirmedAt: new Date(), confirmedById: req.auth.userId },
        }),
        app.prisma.order.update({
          where: { id: payment.orderId },
          data: { amountPaid: paid, paymentState: state },
        }),
      ]);

      audit(app, {
        actorUserId: req.auth.userId,
        action: ACTIONS.PAYMENT_CONFIRM,
        entityType: 'payment',
        entityId: payment.id,
        before: { status: 'declared', orderAmountPaid: Number(payment.order.amountPaid) },
        after: { status: 'confirmed', orderAmountPaid: paid, paymentState: state },
        ip: req.ip,
      });

      notifyCompany(app, payment.companyId, {
        type: TYPES.PAYMENT_CONFIRMED,
        vars: { orderNo: payment.order.orderNo, amount: Number(payment.amount) },
        data: { orderId: payment.orderId },
      });

      return {
        id: payment.id,
        status: 'confirmed',
        orderId: payment.orderId,
        amountPaid: paid,
        paymentState: order.paymentState,
      };
    },
  );

  app.post(
    '/admin/payments/:id/reject',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Reject a declared payment (bounced cheque, cash never arrived)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const payment = await app.prisma.payment.findUnique({ where: { id: req.params.id } });
      if (!payment) throw notFound('PAYMENT_NOT_FOUND', 'No such payment');
      if (payment.status !== 'declared') {
        throw badRequest('ALREADY_RESOLVED', `This payment is already ${payment.status}`);
      }
      // Nothing to undo on the order: a declared payment never moved amount_paid.
      await app.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'rejected', confirmedAt: new Date(), confirmedById: req.auth.userId },
      });
      return { id: payment.id, status: 'rejected' };
    },
  );

  app.patch(
    '/admin/orders/:id/status',
    {
      onRequest: staff,
      schema: {
        tags: ['admin'],
        summary: 'Advance an order through fulfilment',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] },
          },
        },
      },
    },
    async (req) => {
      const order = await app.prisma.order.update({
        where: { id: req.params.id },
        data: { status: req.body.status },
        select: { id: true, orderNo: true, status: true, companyId: true },
      });

      const LABELS = {
        confirmed: ['Confirmée', 'Confirmed'],
        preparing: ['En préparation', 'Being prepared'],
        shipped: ['Expédiée', 'Shipped'],
        delivered: ['Livrée', 'Delivered'],
        cancelled: ['Annulée', 'Cancelled'],
      };
      const [statusFr, statusEn] = LABELS[order.status] ?? [order.status, order.status];

      notifyCompany(app, order.companyId, {
        type: TYPES.ORDER_STATUS,
        vars: { orderNo: order.orderNo, statusFr, statusEn },
        data: { orderId: order.id, status: order.status },
      });

      return { id: order.id, orderNo: order.orderNo, status: order.status };
    },
  );

  // --- credit policy (admin only) ----------------------------------------
  app.get(
    '/admin/settings',
    { onRequest: staff, schema: { tags: ['admin'], summary: 'Current policy', security: [{ bearerAuth: [] }] } },
    async () => getSettings(app.prisma),
  );

  app.patch(
    '/admin/settings',
    {
      onRequest: adminOnly, // an agent can approve accounts but not move the ceiling
      schema: {
        tags: ['admin'],
        summary: 'Update Naftal-wide credit policy (admin only)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            credit_limit: { type: 'number', minimum: 0 },
            credit_term_days: { type: 'integer', minimum: 1, maximum: 365 },
            vat_rate: { type: 'number', minimum: 0, maximum: 1 },
            price_display_mode: { type: 'string', enum: ['TTC', 'HT'] },
          },
        },
      },
    },
    async (req) => {
      const before = await getSettings(app.prisma);

      await app.prisma.$transaction(
        Object.entries(req.body).map(([key, value]) =>
          app.prisma.appSetting.upsert({
            where: { key },
            update: { value, updatedById: req.auth.userId },
            create: { key, value, updatedById: req.auth.userId },
          }),
        ),
      );

      invalidateSettings();

      audit(app, {
        actorUserId: req.auth.userId,
        action: ACTIONS.SETTINGS_UPDATE,
        entityType: 'app_settings',
        entityId: Object.keys(req.body).join(','),
        before,
        after: req.body,
        ip: req.ip,
      });

      return getSettings(app.prisma);
    },
  );
}
