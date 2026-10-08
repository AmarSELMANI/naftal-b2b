import { createHash } from 'node:crypto';
import * as svc from './orders.service.js';
import { badRequest, conflict } from '../../lib/errors.js';

const orderShape = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    orderNo: { type: 'string' },
    status: { type: 'string' },
    paymentType: { type: 'string' },
    paymentState: { type: 'string' },
    subtotal: { type: 'number' },
    vatAmount: { type: 'number' },
    total: { type: 'number' },
    amountPaid: { type: 'number' },
    remaining: { type: 'number' },
    dueDate: { type: ['string', 'null'] },
    daysLeft: { type: ['integer', 'null'] },
    urgency: { type: ['string', 'null'] },
    isOverdue: { type: 'boolean' },
    createdAt: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          productId: { type: 'string' },
          name: { type: 'string' },
          imageUrl: { type: ['string', 'null'] },
          quantity: { type: 'integer' },
          unitPrice: { type: 'number' },
          lineTotal: { type: 'number' },
        },
      },
    },
  },
};

export default async function orderRoutes(app) {
  const customer = app.requireFullScope;

  /**
   * Place an order.
   *
   * `Idempotency-Key` is required, not optional. A mobile network drops the
   * response, the user taps "Confirm purchase" again, and without this they are
   * billed twice. The key is a UUID the app generates once per checkout and
   * reuses across retries. §5.5
   */
  app.post(
    '/orders',
    {
      onRequest: customer,
      schema: {
        tags: ['orders'],
        summary: 'Place an order (one DB round trip, see place_order())',
        security: [{ bearerAuth: [] }],
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 128 } },
        },
        body: {
          type: 'object',
          required: ['items', 'paymentType'],
          properties: {
            // No prices here, on purpose: the server prices the order from the
            // database. Trusting a client total is how a 13,500 DA tire gets
            // bought for 1 DA.
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1, maximum: 9999 },
                },
              },
            },
            paymentType: { type: 'string', enum: ['immediate', 'credit'] },
          },
        },
        response: { 201: orderShape },
      },
    },
    async (req, reply) => {
      const key = req.headers['idempotency-key'];
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ body: req.body, user: req.auth.userId }))
        .digest('hex');

      const existing = await app.prisma.idempotencyKey.findUnique({ where: { key } });
      if (existing) {
        // Same key, different body: the client has a bug, and silently
        // returning the old order would hide it.
        if (existing.requestHash !== fingerprint) {
          throw conflict('IDEMPOTENCY_KEY_REUSED',
            'That Idempotency-Key was already used for a different request');
        }
        return reply.code(existing.statusCode).send(existing.responseBody);
      }

      const order = await svc.placeOrder(app.prisma, {
        companyId: req.auth.companyId,
        userId: req.auth.userId,
        items: req.body.items,
        paymentType: req.body.paymentType,
      });

      // Recorded after success only: a failed attempt must stay retryable.
      await app.prisma.idempotencyKey.create({
        data: {
          key,
          userId: req.auth.userId,
          endpoint: 'POST /orders',
          requestHash: fingerprint,
          statusCode: 201,
          responseBody: order,
        },
      }).catch(() => {}); // a lost replay guard must not fail a placed order

      return reply.code(201).send(order);
    },
  );

  app.get(
    '/orders',
    {
      onRequest: customer,
      schema: {
        tags: ['orders'],
        summary: 'My company’s orders, newest first (keyset paginated)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            status: { type: 'string', enum: ['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] },
          },
        },
      },
    },
    async (req) =>
      svc.listOrders(app.prisma, {
        companyId: req.auth.companyId,
        cursor: req.query.cursor,
        limit: req.query.limit ?? 20,
        status: req.query.status,
      }),
  );

  app.get(
    '/orders/:id',
    {
      onRequest: customer,
      schema: {
        tags: ['orders'],
        summary: 'One order',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: { 200: orderShape },
      },
    },
    async (req) => svc.getOrder(app.prisma, { companyId: req.auth.companyId, orderId: req.params.id }),
  );

  app.get(
    '/credit',
    {
      onRequest: customer,
      schema: {
        tags: ['orders'],
        summary: 'Credit ceiling, outstanding balance and what is left',
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => svc.creditSummary(app.prisma, req.auth.companyId),
  );

  app.post(
    '/orders/:id/payments',
    {
      onRequest: customer,
      schema: {
        tags: ['orders'],
        summary: 'Declare a payment (an agent confirms receipt separately)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['method'],
          properties: {
            method: { type: 'string', enum: ['card', 'cheque', 'cash', 'bank_transfer'] },
            amount: { type: 'number', exclusiveMinimum: 0 },
            reference: { type: 'string', maxLength: 120 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await svc.declarePayment(app.prisma, {
        companyId: req.auth.companyId,
        orderId: req.params.id,
        method: req.body.method,
        amount: req.body.amount,
        reference: req.body.reference,
      });
      return reply.code(201).send(p);
    },
  );

  app.post(
    '/orders/:id/cancel',
    {
      onRequest: customer,
      schema: {
        tags: ['orders'],
        summary: 'Cancel an order, restoring stock and freeing credit',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => svc.cancelOrder(app.prisma, { companyId: req.auth.companyId, orderId: req.params.id }),
  );
}
