// End-to-end test of the order, credit and payment path.
const BASE = 'http://localhost:3100/v1';

// The admin password is deliberately not a constant here. The seed no longer
// ships a default: it generates a random password and prints it once, so there
// is nothing correct to hardcode. The npm script loads backend/.env, which is
// where the value belongs (and which is gitignored).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD is not set. Add it to backend/.env with the password the seed printed.');
  process.exit(1);
}
let pass = 0, fail = 0;

const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '   -> ' + extra : '')); }
};

async function call(method, path, { token, body, idem } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (idem) headers['Idempotency-Key'] = idem;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json };
}

const uuid = () => crypto.randomUUID();
const stamp = Date.now();

// --- a fresh, approved company so credit state starts clean -----------------
console.log('\n=== setup: register + approve a company ===');
const reg = await call('POST', '/auth/register', {
  body: {
    firstName: 'Order', lastName: 'Tester', username: 'orders_' + stamp,
    password: 'Orders!2026pass', enterpriseName: 'SARL Order Test ' + stamp,
    enterpriseStatus: 'SARL', termsAccepted: true,
  },
});
ok(reg.status === 201, 'company registered');

const admin = (await call('POST', '/auth/login', { body: { username: 'admin', password: ADMIN_PASSWORD } })).body;
await call('POST', `/admin/account-requests/${reg.body.accountRequestId}/approve`, { token: admin.accessToken });

const login = (await call('POST', '/auth/login', {
  body: { username: 'orders_' + stamp, password: 'Orders!2026pass' },
})).body;
ok(login.scope === 'full', 'approved company gets full scope');
const token = login.accessToken;

const catalog = (await call('GET', '/catalog')).body;
const findProduct = (model) => {
  let hit = null;
  const walk = (n) => {
    for (const b of n.brands ?? []) for (const p of b.products ?? []) if (p.model === model) hit = p;
    (n.children ?? []).forEach(walk);
  };
  catalog.categories.forEach(walk);
  return hit;
};
const tire = findProduct('AURES');       // 9200 DA
const oos = findProduct('ALL-S-C2');     // seeded with 0 stock
ok(!!tire && !!oos, 'found test products in the catalog');

// This suite BUYS things, and it runs against the same database every time, so
// it must not depend on stock a previous run left behind. Reset the one product
// it spends to a known quantity first; without this the suite passes once and
// then fails with INSUFFICIENT_STOCK forever.
const reset = await call('PATCH', `/admin/products/${tire.id}/stock`, {
  token: admin.accessToken, body: { quantity: 500 },
});
ok(reset.status === 200 && reset.body?.quantity === 500,
  'test stock reset to a known quantity', JSON.stringify(reset.body));

// --- credit starts empty ----------------------------------------------------
console.log('\n=== credit summary before ordering ===');
const credit0 = await call('GET', '/credit', { token });
ok(credit0.body?.creditLimit === 1250000, 'ceiling is 1,250,000 DA', String(credit0.body?.creditLimit));
ok(credit0.body?.outstanding === 0, 'nothing outstanding yet', String(credit0.body?.outstanding));
ok(credit0.body?.available === 1250000, 'full ceiling available');
ok(credit0.body?.creditTermDays === 30, 'credit term is 30 days');

// --- an immediate order -----------------------------------------------------
console.log('\n=== immediate purchase ===');
const buy = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: tire.id, quantity: 3 }], paymentType: 'immediate' },
});
ok(buy.status === 201, 'order placed', 'got ' + buy.status + ' ' + JSON.stringify(buy.body));
ok(/^CMD-\d{4}-\d{6}$/.test(buy.body?.orderNo ?? ''), 'order number is CMD-YYYY-NNNNNN', buy.body?.orderNo);
ok(buy.body?.total === 27600, '3 x 9200 = 27,600 DA TTC', String(buy.body?.total));
ok(Math.abs((buy.body.subtotal + buy.body.vatAmount) - buy.body.total) < 0.01,
  'HT + TVA sums exactly back to TTC', `${buy.body.subtotal} + ${buy.body.vatAmount}`);
ok(buy.body?.dueDate === null, 'an immediate order has no deadline');
ok(buy.body?.items?.[0]?.name === tire.displayName, 'item name snapshotted');

const creditAfterImmediate = await call('GET', '/credit', { token });
ok(creditAfterImmediate.body.outstanding === 0, 'an immediate order does NOT consume credit');

// --- stock actually moved ---------------------------------------------------
const liveProduct = (await call('GET', `/products/${tire.id}`)).body;
ok(typeof liveProduct.stockQuantity === 'number' && liveProduct.stockQuantity >= 0,
  'live product endpoint reports a real stock quantity', String(liveProduct.stockQuantity));
console.log(`       (stock now ${liveProduct.stockQuantity})`);

// --- idempotency ------------------------------------------------------------
console.log('\n=== idempotency: the double-tap guard ===');
const key = uuid();
const first = await call('POST', '/orders', {
  token, idem: key,
  body: { items: [{ productId: tire.id, quantity: 1 }], paymentType: 'immediate' },
});
const replay = await call('POST', '/orders', {
  token, idem: key,
  body: { items: [{ productId: tire.id, quantity: 1 }], paymentType: 'immediate' },
});
ok(first.status === 201, 'first call creates the order');
ok(replay.body?.orderNo === first.body?.orderNo,
  'replaying the same key returns the SAME order, not a second one',
  `${first.body?.orderNo} vs ${replay.body?.orderNo}`);

const differentBody = await call('POST', '/orders', {
  token, idem: key,
  body: { items: [{ productId: tire.id, quantity: 7 }], paymentType: 'immediate' },
});
ok(differentBody.status === 409 && differentBody.body?.error?.code === 'IDEMPOTENCY_KEY_REUSED',
  'same key + different body is rejected, not silently ignored', differentBody.body?.error?.code);

const noKey = await call('POST', '/orders', {
  token, body: { items: [{ productId: tire.id, quantity: 1 }], paymentType: 'immediate' },
});
ok(noKey.status === 400, 'Idempotency-Key is required, not optional', 'got ' + noKey.status);

// --- stock limits -----------------------------------------------------------
console.log('\n=== stock is enforced server-side ===');
const absurd = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: tire.id, quantity: 99999 }], paymentType: 'immediate' },
});
ok(absurd.status === 400 && absurd.body?.error?.code === 'VALIDATION_FAILED',
  'a quantity beyond the schema max is refused by the schema, before any query',
  absurd.body?.error?.code);

// Within schema bounds, but far beyond what is on the shelf: this is the check
// that has to come from place_order itself.
const tooMany = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: tire.id, quantity: 9000 }], paymentType: 'immediate' },
});
ok(tooMany.status === 409 && tooMany.body?.error?.code === 'INSUFFICIENT_STOCK',
  'ordering more than is in stock -> INSUFFICIENT_STOCK', tooMany.body?.error?.code);

await call('PATCH', `/admin/products/${oos.id}/stock`, {
  token: admin.accessToken, body: { quantity: 0 },
});
const outOfStock = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: oos.id, quantity: 1 }], paymentType: 'immediate' },
});
ok(outOfStock.status === 409 && outOfStock.body?.error?.code === 'INSUFFICIENT_STOCK',
  'a zero-stock product cannot be bought', outOfStock.body?.error?.code);

const ghost = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }], paymentType: 'immediate' },
});
ok(ghost.status === 404, 'an unknown product id is rejected, not silently dropped', 'got ' + ghost.status);

// --- credit orders ----------------------------------------------------------
console.log('\n=== buying on credit ===');
const onCredit = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: tire.id, quantity: 2 }], paymentType: 'credit' },
});
ok(onCredit.status === 201, 'credit order placed');
ok(onCredit.body?.dueDate !== null, 'it has a due date');
ok(onCredit.body?.daysLeft === 30, 'daysLeft computed server-side = 30', String(onCredit.body?.daysLeft));
ok(onCredit.body?.urgency === 'ok', 'urgency "ok" at 30 days out', onCredit.body?.urgency);
ok(onCredit.body?.paymentState === 'unpaid', 'starts unpaid');

const credit1 = await call('GET', '/credit', { token });
ok(credit1.body.outstanding === 18400, 'outstanding = 2 x 9200 = 18,400 DA', String(credit1.body.outstanding));
ok(credit1.body.available === 1250000 - 18400, 'available reduced by exactly that', String(credit1.body.available));

// --- the ceiling ------------------------------------------------------------
console.log('\n=== the credit ceiling ===');
const huge = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: tire.id, quantity: 200 }], paymentType: 'credit' },
});
// 200 x 9200 = 1,840,000 > the 1,250,000 ceiling. Stock would also fail, so the
// point is only that it is refused and nothing is committed.
ok(huge.status === 409, 'an order past the ceiling is refused', 'got ' + huge.status);

const creditUnchanged = await call('GET', '/credit', { token });
ok(creditUnchanged.body.outstanding === 18400,
  'a refused order changes nothing (transaction rolled back)', String(creditUnchanged.body.outstanding));

// --- payment ----------------------------------------------------------------
console.log('\n=== declaring a payment ===');
const creditOrderId = onCredit.body.id;
const pay = await call('POST', `/orders/${creditOrderId}/payments`, {
  token, body: { method: 'cheque', reference: 'CHQ-4471' },
});
ok(pay.status === 201, 'payment declared', 'got ' + pay.status + ' ' + JSON.stringify(pay.body));
ok(pay.body?.status === 'declared', 'status is "declared", not "paid"', pay.body?.status);
ok(pay.body?.awaitingConfirmation === true, 'flagged as awaiting an agent');
ok(pay.body?.amount === 18400, 'defaults to the full remaining amount', String(pay.body?.amount));

const stillOwed = await call('GET', '/credit', { token });
ok(stillOwed.body.outstanding === 18400,
  'credit is NOT freed until an agent confirms receipt', String(stillOwed.body.outstanding));

const overpay = await call('POST', `/orders/${creditOrderId}/payments`, {
  token, body: { method: 'cash', amount: 999999 },
});
ok(overpay.status === 400, 'cannot declare more than is owed', 'got ' + overpay.status);

// --- agent confirms ---------------------------------------------------------
console.log('\n=== agent confirms receipt ===');
const confirm = await call('POST', `/admin/payments/${pay.body.id}/confirm`, { token: admin.accessToken });
ok(confirm.status === 200, 'agent confirms the payment', 'got ' + confirm.status + ' ' + JSON.stringify(confirm.body));

const settled = await call('GET', `/orders/${creditOrderId}`, { token });
ok(settled.body?.paymentState === 'paid', 'order is now paid', settled.body?.paymentState);
ok(settled.body?.amountPaid === 18400, 'amountPaid moved', String(settled.body?.amountPaid));

const creditFreed = await call('GET', '/credit', { token });
ok(creditFreed.body.outstanding === 0, 'credit freed after confirmation', String(creditFreed.body.outstanding));
ok(creditFreed.body.available === 1250000, 'full ceiling available again');

// --- listing ----------------------------------------------------------------
console.log('\n=== order list ===');
const list = await call('GET', '/orders?limit=2', { token });
ok(list.status === 200, 'orders list');
ok(list.body?.items?.length === 2, 'respects the limit', String(list.body?.items?.length));
ok(!!list.body?.nextCursor, 'returns a keyset cursor when more remain');
const page2 = await call('GET', `/orders?limit=2&cursor=${encodeURIComponent(list.body.nextCursor)}`, { token });
ok(page2.status === 200 && page2.body.items.length > 0, 'cursor fetches the next page');
const overlap = page2.body.items.some((o) => list.body.items.some((x) => x.id === o.id));
ok(!overlap, 'pages do not overlap');

// --- isolation --------------------------------------------------------------
console.log('\n=== one company cannot see another’s orders ===');
const other = await call('POST', '/auth/register', {
  body: {
    firstName: 'Other', lastName: 'Co', username: 'other_' + stamp,
    password: 'Other!2026pass', enterpriseName: 'SARL Other ' + stamp, termsAccepted: true,
  },
});
await call('POST', `/admin/account-requests/${other.body.accountRequestId}/approve`, { token: admin.accessToken });
const otherLogin = (await call('POST', '/auth/login', {
  body: { username: 'other_' + stamp, password: 'Other!2026pass' },
})).body;
const peek = await call('GET', `/orders/${creditOrderId}`, { token: otherLogin.accessToken });
ok(peek.status === 404, 'another company gets 404, not the order', 'got ' + peek.status);
const otherList = await call('GET', '/orders', { token: otherLogin.accessToken });
ok(otherList.body?.items?.length === 0, 'and sees an empty list of its own');

// --- cancellation -----------------------------------------------------------
console.log('\n=== cancelling restores stock ===');
const before = (await call('GET', `/products/${tire.id}`)).body.stockQuantity;
const toCancel = await call('POST', '/orders', {
  token, idem: uuid(),
  body: { items: [{ productId: tire.id, quantity: 4 }], paymentType: 'immediate' },
});
const during = (await call('GET', `/products/${tire.id}`)).body.stockQuantity;
ok(during === before - 4, 'stock dropped by 4 on order', `${before} -> ${during}`);

const cancelled = await call('POST', `/orders/${toCancel.body.id}/cancel`, { token });
ok(cancelled.status === 200, 'order cancelled');
const after = (await call('GET', `/products/${tire.id}`)).body.stockQuantity;
ok(after === before, 'stock restored exactly', `${during} -> ${after} (was ${before})`);

console.log('\n' + '='.repeat(56));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
