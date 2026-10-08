// Push notifications, via Expo's push service.
//
// Every notification is stored bilingually and sent in the recipient's own
// language, because the server knows who it is writing to while the app does
// not (§4.1 keeps *API* responses language-agnostic; a push has one language by
// the time it reaches the phone, so the choice has to be made here).
//
// Sending is always fire-and-forget. An approval must not fail because Expo's
// push service is slow, and a push that does not arrive is a missed convenience,
// never a lost state change — the app re-reads the truth from the API anyway.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo's documented maximum per request

export const TYPES = {
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_DENIED: 'account_denied',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  ORDER_STATUS: 'order_status',
  PAYMENT_DUE: 'payment_due',
  PAYMENT_OVERDUE: 'payment_overdue',
};

/** Message templates. Both languages are stored; one is sent. */
export const TEMPLATES = {
  [TYPES.ACCOUNT_APPROVED]: (v) => ({
    titleFr: 'Compte approuvé',
    bodyFr: `Bienvenue ${v.name} — votre compte Naftal est actif.`,
    titleEn: 'Account approved',
    bodyEn: `Welcome ${v.name} — your Naftal account is active.`,
  }),
  [TYPES.ACCOUNT_DENIED]: (v) => ({
    titleFr: 'Demande refusée',
    bodyFr: v.reason ? `Motif : ${v.reason}` : 'Votre demande d’ouverture de compte a été refusée.',
    titleEn: 'Request denied',
    bodyEn: v.reason ? `Reason: ${v.reason}` : 'Your account request was denied.',
  }),
  [TYPES.PAYMENT_CONFIRMED]: (v) => ({
    titleFr: 'Paiement confirmé',
    bodyFr: `${v.amount} DA reçus pour la commande ${v.orderNo}.`,
    titleEn: 'Payment confirmed',
    bodyEn: `${v.amount} DA received for order ${v.orderNo}.`,
  }),
  [TYPES.ORDER_STATUS]: (v) => ({
    titleFr: `Commande ${v.orderNo}`,
    bodyFr: `Statut : ${v.statusFr}`,
    titleEn: `Order ${v.orderNo}`,
    bodyEn: `Status: ${v.statusEn}`,
  }),
  [TYPES.PAYMENT_DUE]: (v) => ({
    titleFr: 'Échéance proche',
    bodyFr: `La commande ${v.orderNo} (${v.amount} DA) est due dans ${v.days} jours.`,
    titleEn: 'Payment due soon',
    bodyEn: `Order ${v.orderNo} (${v.amount} DA) is due in ${v.days} days.`,
  }),
  [TYPES.PAYMENT_OVERDUE]: (v) => ({
    titleFr: 'Délai dépassé',
    bodyFr: `La commande ${v.orderNo} (${v.amount} DA) est en retard de paiement.`,
    titleEn: 'Payment overdue',
    bodyEn: `Order ${v.orderNo} (${v.amount} DA) is overdue.`,
  }),
};

/** Expo tokens have a fixed shape; anything else is a client bug or an attack. */
export const isExpoPushToken = (t) =>
  typeof t === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

/**
 * Send to Expo and prune tokens it tells us are dead.
 *
 * Expo replies per-message. A `DeviceNotRegistered` ticket means the app was
 * uninstalled, and keeping that token would mean sending to it forever.
 */
async function pushToExpo(app, messages) {
  if (messages.length === 0) return { sent: 0, pruned: 0 };

  let sent = 0;
  let pruned = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    let data;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch.map(({ _token, ...m }) => m)),
      });
      data = await res.json();
    } catch (err) {
      app.log.warn({ err }, 'expo push request failed');
      continue;
    }

    const tickets = data?.data ?? [];
    for (let n = 0; n < tickets.length; n++) {
      const ticket = tickets[n];
      if (ticket?.status === 'ok') { sent++; continue; }

      if (ticket?.details?.error === 'DeviceNotRegistered') {
        const token = batch[n]?._token;
        if (token) {
          pruned++;
          await app.prisma.deviceToken.deleteMany({ where: { expoPushToken: token } }).catch(() => {});
        }
      } else {
        app.log.warn({ ticket }, 'expo push ticket not ok');
      }
    }
  }

  return { sent, pruned };
}

/**
 * Record a notification for a user and push it to their devices.
 *
 * `dedupeKey` makes reminders safe to re-run: the daily sweep can execute twice
 * without the customer being told about the same deadline twice.
 */
export async function notify(app, { userId, type, vars = {}, data = {}, dedupeKey }) {
  const template = TEMPLATES[type];
  if (!template) {
    app.log.error({ type }, 'unknown notification type');
    return;
  }
  const text = template(vars);

  try {
    if (dedupeKey) {
      const already = await app.prisma.notification.findFirst({
        where: { userId, type, data: { path: ['dedupeKey'], equals: dedupeKey } },
      });
      if (already) return;
    }

    await app.prisma.notification.create({
      data: {
        userId,
        type,
        titleFr: text.titleFr,
        bodyFr: text.bodyFr,
        titleEn: text.titleEn,
        bodyEn: text.bodyEn,
        data: dedupeKey ? { ...data, dedupeKey } : data,
      },
    });

    const devices = await app.prisma.deviceToken.findMany({ where: { userId } });
    if (devices.length === 0) return;

    const messages = devices.map((d) => {
      const fr = (d.language ?? 'fr') === 'fr';
      return {
        _token: d.expoPushToken, // stripped before sending; used to prune
        to: d.expoPushToken,
        title: fr ? text.titleFr : text.titleEn,
        body: fr ? text.bodyFr : text.bodyEn,
        data: { type, ...data },
        sound: 'default',
        priority: 'high',
      };
    });

    const result = await pushToExpo(app, messages);
    app.log.info({ type, userId, ...result }, 'notification dispatched');
  } catch (err) {
    // Never let a notification failure break the action that triggered it.
    app.log.error({ err, type, userId }, 'notify failed');
  }
}

/** Everyone at a company who should hear about its orders. */
export async function notifyCompany(app, companyId, payload) {
  const users = await app.prisma.user.findMany({
    where: { companyId, isActive: true, role: 'customer' },
    select: { id: true },
  });
  await Promise.all(users.map((u) => notify(app, { ...payload, userId: u.id })));
}

/**
 * Deadline reminders.
 *
 * This is the one thing that genuinely needs a schedule: everything else in the
 * system is computed on read (§5.7), but "tell me three days before" has no
 * reader to compute it for. Idempotent via dedupeKey, so running it twice in a
 * day is harmless — which matters, because the simple in-process timer below
 * restarts whenever the server does.
 */
export async function sweepDueReminders(app, { soonDays = 3 } = {}) {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + soonDays);

  const orders = await app.prisma.order.findMany({
    where: {
      paymentType: 'credit',
      paymentState: { not: 'paid' },
      status: { not: 'cancelled' },
      dueDate: { not: null, lte: horizon },
    },
    include: { company: { select: { id: true } } },
  });

  let count = 0;
  for (const o of orders) {
    const due = new Date(o.dueDate);
    const days = Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
      - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000);

    const overdue = days < 0;
    await notifyCompany(app, o.companyId, {
      type: overdue ? TYPES.PAYMENT_OVERDUE : TYPES.PAYMENT_DUE,
      vars: {
        orderNo: o.orderNo,
        amount: Number(o.total) - Number(o.amountPaid),
        days,
      },
      data: { orderId: o.id },
      // One reminder per order per state per day.
      dedupeKey: `${o.id}:${overdue ? 'overdue' : 'due'}:${today.toISOString().slice(0, 10)}`,
    });
    count++;
  }

  app.log.info({ considered: count }, 'due-date sweep complete');
  return { considered: count };
}
