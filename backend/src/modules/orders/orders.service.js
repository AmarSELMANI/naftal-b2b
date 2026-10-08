// Orders: placement, listing, credit, payments.

import { AppError, CODES, badRequest, notFound, conflict } from '../../lib/errors.js';
import { creditStatus } from '../../lib/dates.js';
import { dec } from '../../lib/money.js';
import { creditTermsFor } from '../../lib/settings.js';
import { invalidateCatalog } from '../catalog/catalog.service.js';

/**
 * place_order() raises P0001 with the code as MESSAGE and anything structured as
 * DETAIL. Prisma surfaces both on `err.meta.message`. Translating here keeps the
 * Postgres error shape out of every caller.
 */
function translatePgError(err) {
  const raw = err?.meta?.message ?? err?.message ?? '';
  const code = raw.match(/ERROR:\s*([A-Z_]+)/)?.[1];
  const detail = raw.match(/DETAIL:\s*(.+?)(?:\n|$)/s)?.[1]?.trim();

  if (!code) return err;

  let parsedDetail;
  try { parsedDetail = detail ? JSON.parse(detail) : undefined; } catch { parsedDetail = detail; }

  switch (code) {
    case 'CREDIT_LIMIT_EXCEEDED':
      return new AppError(409, CODES.CREDIT_LIMIT_EXCEEDED,
        'This order would take the company past its credit ceiling', parsedDetail);
    case 'INSUFFICIENT_STOCK':
      return new AppError(409, CODES.INSUFFICIENT_STOCK,
        'Not enough stock for the requested quantity', { productId: parsedDetail });
    case 'PRODUCT_UNAVAILABLE':
      return new AppError(409, CODES.PRODUCT_UNAVAILABLE,
        'That product is no longer available', { productId: parsedDetail });
    case 'PRODUCT_NOT_FOUND':
      return notFound('PRODUCT_NOT_FOUND', 'One of the products does not exist');
    case 'ACCOUNT_NOT_APPROVED':
      return new AppError(403, CODES.ACCOUNT_PENDING, 'This account is not approved');
    case 'INVALID_QUANTITY':
      return badRequest('INVALID_QUANTITY', 'Quantity must be a positive whole number');
    case 'EMPTY_ORDER':
      return badRequest('EMPTY_ORDER', 'An order needs at least one item');
    default:
      return err;
  }
}

/** Shape an order row for the app, with the deadline maths already done. */
function present(order) {
  const credit = creditStatus(order);
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    paymentType: order.paymentType,
    paymentState: order.paymentState,
    subtotal: dec(order.subtotal),
    vatAmount: dec(order.vatAmount),
    total: dec(order.total),
    amountPaid: dec(order.amountPaid),
    remaining: dec(order.total) - dec(order.amountPaid),
    dueDate: order.dueDate,
    // Computed server-side so orders.js can drop calculateDaysLeft and
    // getDaysLeftColor — one copy of a business rule, not two. §5.7
    daysLeft: credit.daysLeft,
    urgency: credit.urgency,
    isOverdue: credit.isOverdue,
    createdAt: order.createdAt,
    items: (order.items ?? []).map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.nameSnapshot,
      imageUrl: i.imageSnapshot,
      quantity: i.quantity,
      unitPrice: dec(i.unitPrice),
      lineTotal: dec(i.lineTotal),
    })),
  };
}

// ---------------------------------------------------------------------------

export async function placeOrder(prisma, { companyId, userId, items, paymentType }) {
  let rows;
  try {
    rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM place_order($1::uuid, $2::uuid, $3::jsonb, $4)',
      companyId,
      userId,
      JSON.stringify(items.map((i) => ({ product_id: i.productId, quantity: i.quantity }))),
      paymentType,
    );
  } catch (err) {
    throw translatePgError(err);
  }

  // Stock changed, so the cached catalog's in-stock flags are stale. §5.2
  invalidateCatalog();

  const order = await prisma.order.findUnique({
    relationLoadStrategy: 'join',
    where: { id: rows[0].out_order_id },
    include: { items: true },
  });
  return present(order);
}

/**
 * Keyset pagination: seeks straight to the position through the index instead
 * of reading and discarding rows, and cannot skip or duplicate when a new order
 * arrives mid-scroll. §5.4
 */
export async function listOrders(prisma, { companyId, cursor, limit = 20, status }) {
  const where = { companyId };
  if (status) where.status = status;

  if (cursor) {
    const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    where.OR = [
      { createdAt: { lt: new Date(ts) } },
      { createdAt: new Date(ts), id: { lt: id } },
    ];
  }

  const rows = await prisma.order.findMany({
    relationLoadStrategy: 'join',
    where,
    include: { items: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra tells us whether another page exists
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map(present),
    nextCursor: hasMore && last
      ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString('base64url')
      : null,
  };
}

export async function getOrder(prisma, { companyId, orderId }) {
  const order = await prisma.order.findFirst({
    relationLoadStrategy: 'join',
    where: { id: orderId, companyId }, // scoped: never another company's order
    include: { items: true },
  });
  if (!order) throw notFound('ORDER_NOT_FOUND', 'No such order');
  return present(order);
}

/** What ProductDetail needs before offering "buy on credit". */
export async function creditSummary(prisma, companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw notFound('COMPANY_NOT_FOUND', 'No such company');

  const { creditLimit, creditTermDays } = await creditTermsFor(prisma, company);

  const open = await prisma.order.findMany({
    where: {
      companyId,
      paymentType: 'credit',
      paymentState: { not: 'paid' },
      status: { not: 'cancelled' },
    },
    select: { total: true, amountPaid: true, dueDate: true, paymentState: true, paymentType: true },
    orderBy: { dueDate: 'asc' },
  });

  const outstanding = open.reduce((s, o) => s + (dec(o.total) - dec(o.amountPaid)), 0);
  const overdueCount = open.filter((o) => creditStatus(o).isOverdue).length;

  return {
    creditLimit,
    creditTermDays,
    outstanding: Math.round(outstanding * 100) / 100,
    available: Math.round((creditLimit - outstanding) * 100) / 100,
    openOrders: open.length,
    overdueCount,
    nextDueDate: open.find((o) => o.dueDate)?.dueDate ?? null,
  };
}

/**
 * Declare a payment. It is NOT confirmed here: an agent confirms receipt in the
 * console, and only then does amount_paid move and the credit free up. That is
 * how cheque and cash genuinely work for B2B in Algeria. §3.3
 */
export async function declarePayment(prisma, { companyId, orderId, method, amount, reference }) {
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId } });
  if (!order) throw notFound('ORDER_NOT_FOUND', 'No such order');
  if (order.paymentState === 'paid') {
    throw conflict(CODES.ORDER_ALREADY_PAID, 'This order is already settled');
  }
  if (order.status === 'cancelled') {
    throw conflict('ORDER_CANCELLED', 'This order was cancelled');
  }

  const remaining = dec(order.total) - dec(order.amountPaid);
  const value = amount ?? remaining;
  if (value <= 0 || value > remaining + 0.001) {
    throw badRequest('INVALID_PAYMENT_AMOUNT',
      `Amount must be between 0 and the ${remaining} DA still owed`, { remaining });
  }

  const payment = await prisma.payment.create({
    data: {
      orderId,
      companyId,
      method,
      amount: value,
      reference: reference ?? null,
      status: 'declared',
    },
  });

  return {
    id: payment.id,
    orderId,
    method: payment.method,
    amount: dec(payment.amount),
    status: payment.status,
    declaredAt: payment.declaredAt,
    // Deliberately explicit: the customer should not think this is settled.
    awaitingConfirmation: true,
  };
}

/** Cancel: restores stock and frees the credit it was holding. */
export async function cancelOrder(prisma, { companyId, orderId }) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId },
    include: { items: true },
  });
  if (!order) throw notFound('ORDER_NOT_FOUND', 'No such order');
  if (order.status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'Already cancelled');
  if (order.status !== 'confirmed') {
    throw conflict('ORDER_IN_PROGRESS', 'This order has already been prepared and cannot be cancelled');
  }
  if (dec(order.amountPaid) > 0) {
    throw conflict('ORDER_PARTLY_PAID', 'A payment has been recorded; contact Naftal to cancel');
  }

  await prisma.$transaction([
    ...order.items.map((i) =>
      prisma.productStock.update({
        where: { productId: i.productId },
        data: { quantity: { increment: i.quantity } },
      }),
    ),
    prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } }),
  ]);

  invalidateCatalog();
  return { id: orderId, status: 'cancelled' };
}
