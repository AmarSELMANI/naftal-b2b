// Audit trail.
//
// Approvals, denials, credit-policy changes, price and stock edits, payment
// confirmations — in a system that extends credit, each of those has to be
// attributable to a person. §3.4
//
// Writes are fire-and-forget: an audit insert must never fail the action it
// records, and must never add its round trip to the user's wait.

export const ACTIONS = {
  ACCOUNT_APPROVE: 'account_request.approve',
  ACCOUNT_DENY: 'account_request.deny',
  SETTINGS_UPDATE: 'settings.update',
  PRODUCT_PRICE: 'product.price_change',
  STOCK_ADJUST: 'product.stock_adjust',
  PAYMENT_CONFIRM: 'payment.confirm',
};

export function audit(app, { actorUserId, action, entityType, entityId, before, after, ip }) {
  app.prisma.auditLog
    .create({
      data: {
        actorUserId: actorUserId ?? null,
        action,
        entityType,
        entityId,
        before: before ?? undefined,
        after: after ?? undefined,
        ip: ip ?? null,
      },
    })
    .catch((err) => app.log.error({ err, action, entityId }, 'audit write failed'));
}
