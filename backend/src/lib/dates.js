// Credit deadline logic — server-side only.
//
// orders.js currently computes days-left and the green/orange/red colour on the
// device. Two copies of a business rule drift apart; the server owns it and
// ships `daysLeft` + `urgency`, leaving the client to pick a colour. §5.7

export const URGENCY = { OK: 'ok', SOON: 'soon', OVERDUE: 'overdue' };

const SOON_THRESHOLD_DAYS = 5; // matches the existing orange band in orders.js
const MS_PER_DAY = 86400000;

/** Whole days from today (UTC midnight) to `dueDate`. Negative means late. */
export function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return null;
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(dueDate);
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Overdue-ness is never stored: it is derived on read, so it cannot go stale
 * and needs no cron job. §5.7
 */
export function creditStatus(order, now = new Date()) {
  if (order.paymentType !== 'credit' || !order.dueDate) {
    return { daysLeft: null, urgency: null, isOverdue: false };
  }
  if (order.paymentState === 'paid') {
    return { daysLeft: null, urgency: URGENCY.OK, isOverdue: false };
  }

  const daysLeft = daysUntil(order.dueDate, now);
  const urgency =
    daysLeft < 0
      ? URGENCY.OVERDUE
      : daysLeft <= SOON_THRESHOLD_DAYS
        ? URGENCY.SOON
        : URGENCY.OK;

  return { daysLeft, urgency, isOverdue: daysLeft < 0 };
}

/** Due date for a new credit order, `termDays` after today. */
export function dueDateFrom(termDays, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + termDays);
  return d;
}
