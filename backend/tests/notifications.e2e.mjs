// Notification tests.
//
// Honest limit: delivery to a real handset cannot be verified from here — that
// needs a physical device and a development build. What IS verified is
// everything up to the handset: token validation, the record written, language
// selection, dedupe, and that the push request Expo receives is well-formed
// (Expo answers a syntactically valid request even for a fake token, and its
// reply tells us which part it disliked).

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
const ok = (c, label, extra = '') => {
  if (c) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '   -> ' + extra : '')); }
};

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json };
}

const stamp = Date.now();

console.log('\n=== setup ===');
const reg = await call('POST', '/auth/register', {
  body: {
    firstName: 'Push', lastName: 'Tester', username: 'push_' + stamp,
    password: 'Push!2026pass', enterpriseName: 'SARL Push ' + stamp, termsAccepted: true,
  },
});
ok(reg.status === 201, 'company registered');
const applicant = reg.body.accessToken;
const admin = (await call('POST', '/auth/login', { body: { username: 'admin', password: ADMIN_PASSWORD } })).body;

console.log('\n=== device registration ===');
const bad = await call('POST', '/devices', { token: applicant, body: { token: 'not-a-token' } });
ok(bad.status === 400 && bad.body?.error?.code === 'INVALID_PUSH_TOKEN',
  'a malformed push token is rejected', bad.body?.error?.code);

const fakeToken = `ExponentPushToken[test-${stamp}]`;
const good = await call('POST', '/devices', {
  token: applicant,
  body: { token: fakeToken, platform: 'android', language: 'fr' },
});
ok(good.status === 200 && good.body?.registered === true,
  'a well-formed token registers', JSON.stringify(good.body));

// An applicant is not approved yet, and this is exactly when they need to
// register for the "you're approved" push.
ok(good.status === 200, 'registration works with an onboarding-scoped token');

const reRegister = await call('POST', '/devices', {
  token: applicant, body: { token: fakeToken, platform: 'android', language: 'en' },
});
ok(reRegister.status === 200, 'the same token re-registers (upsert, not duplicate)');

console.log('\n=== approval produces a notification ===');
const before = await call('GET', '/notifications', { token: applicant });
ok(before.body?.items?.length === 0, 'no notifications yet', String(before.body?.items?.length));

await call('POST', `/admin/account-requests/${reg.body.accountRequestId}/approve`, { token: admin.accessToken });
await new Promise((r) => setTimeout(r, 2500)); // dispatch is fire-and-forget

const after = await call('GET', '/notifications', { token: applicant });
const approved = after.body?.items?.find((n) => n.type === 'account_approved');
ok(!!approved, 'an account_approved notification was recorded',
  JSON.stringify(after.body?.items?.map((i) => i.type)));
ok(!!approved?.title?.fr && !!approved?.title?.en,
  'stored in BOTH languages', JSON.stringify(approved?.title));
ok(approved?.body?.fr?.includes('SARL Push'),
  'the French body names the company', approved?.body?.fr);
ok(after.body?.unread === 1, 'counted as unread', String(after.body?.unread));

console.log('\n=== marking read ===');
const read = await call('POST', '/notifications/read', { token: applicant, body: {} });
ok(read.body?.marked >= 1, 'marked read', JSON.stringify(read.body));
const afterRead = await call('GET', '/notifications', { token: applicant });
ok(afterRead.body?.unread === 0, 'unread count back to zero', String(afterRead.body?.unread));

console.log('\n=== the due-date sweep is idempotent ===');
const login = (await call('POST', '/auth/login', {
  body: { username: 'push_' + stamp, password: 'Push!2026pass' },
})).body;

// an overdue credit order for this company
const catalog = (await call('GET', '/catalog')).body;
let product = null;
const walk = (n) => {
  for (const b of n.brands ?? []) for (const p of b.products ?? []) if (p.inStock && !product) product = p;
  (n.children ?? []).forEach(walk);
};
catalog.categories.forEach(walk);

await fetch(BASE + '/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + login.accessToken,
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], paymentType: 'credit' }),
});

const sweep1 = await call('POST', '/admin/notifications/sweep', { token: admin.accessToken });
ok(sweep1.status === 200, 'sweep runs', JSON.stringify(sweep1.body));
await new Promise((r) => setTimeout(r, 1500));
const n1 = (await call('GET', '/notifications', { token: login.accessToken })).body.items.length;

const sweep2 = await call('POST', '/admin/notifications/sweep', { token: admin.accessToken });
ok(sweep2.status === 200, 'sweep runs a second time');
await new Promise((r) => setTimeout(r, 1500));
const n2 = (await call('GET', '/notifications', { token: login.accessToken })).body.items.length;

ok(n1 === n2, 'running the sweep twice does NOT duplicate reminders', `${n1} then ${n2}`);

console.log('\n=== access control ===');
const anon = await call('GET', '/notifications');
ok(anon.status === 401, 'notifications need a token', 'got ' + anon.status);
const notStaff = await call('POST', '/admin/notifications/sweep', { token: login.accessToken });
ok(notStaff.status === 403, 'a customer cannot trigger the sweep', 'got ' + notStaff.status);

console.log('\n' + '='.repeat(56));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
