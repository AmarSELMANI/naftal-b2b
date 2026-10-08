// End-to-end test of the Phase 1 onboarding flow.
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

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) { payload = form; }
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, body: json, raw: text };
}

const stamp = Date.now();

console.log('\n=== 1. Registration ===');
const reg = await call('POST', '/auth/register', {
  body: {
    firstName: 'Mohamed', lastName: 'Selmani',
    username: 'sarl_test_' + stamp, password: 'Chang3Me!2026',
    email: `contact+${stamp}@sarl-test.dz`, phone: '0550123456',
    enterpriseName: 'SARL Test Transport ' + stamp, enterpriseStatus: 'SARL',
    tradeRegisterNo: '16/00-1234567B23', tin: '000216001234567',
    address: 'Zone industrielle, Alger', termsAccepted: true,
  },
});
ok(reg.status === 201, 'register returns 201', 'got ' + reg.status + ' ' + reg.raw.slice(0, 200));
ok(reg.body?.scope === 'onboarding', 'scope is onboarding, not full', reg.body?.scope);
ok(reg.body?.company?.approvalStatus === 'pending', 'company starts pending');
ok(!!reg.body?.accountRequestId, 'an account request was created');
ok(reg.body?.company?.creditLimit === undefined, 'no credit terms leaked to a pending company');

const applicant = reg.body.accessToken;
const applicantRefresh = reg.body.refreshToken;
const requestId = reg.body.accountRequestId;

console.log('\n=== 2. Terms checkbox is enforced server-side ===');
const noTerms = await call('POST', '/auth/register', {
  body: {
    firstName: 'X', lastName: 'Y', username: 'noterms_' + stamp, password: 'Chang3Me!2026',
    enterpriseName: 'Z', termsAccepted: false,
  },
});
ok(noTerms.status === 400, 'termsAccepted:false is rejected', 'got ' + noTerms.status);

console.log('\n=== 3. Duplicate username ===');
const dup = await call('POST', '/auth/register', {
  body: {
    firstName: 'A', lastName: 'B', username: 'sarl_test_' + stamp, password: 'Chang3Me!2026',
    enterpriseName: 'Another', termsAccepted: true,
  },
});
ok(dup.status === 409 && dup.body?.error?.code === 'USERNAME_TAKEN',
  'duplicate username -> 409 USERNAME_TAKEN', dup.body?.error?.code);

console.log('\n=== 4. The onboarding gate (the security property) ===');
const catBlocked = await call('GET', '/catalog', { token: applicant });
ok(catBlocked.status === 200, 'catalog is public, so still readable');
const ordersBlocked = await call('GET', '/admin/account-requests', { token: applicant });
ok(ordersBlocked.status === 403, 'a pending applicant cannot reach admin routes', 'got ' + ordersBlocked.status);
const mine = await call('GET', '/account-requests/mine', { token: applicant });
ok(mine.status === 200, 'but CAN read their own request status');
ok(mine.body?.missingDocuments?.length === 5, 'all 5 documents reported missing', JSON.stringify(mine.body?.missingDocuments));

console.log('\n=== 5. Document upload ===');
const fd = new FormData();
fd.append('kind', 'id_card');
fd.append('file', new Blob([Buffer.from('%PDF-1.4 fake id card')], { type: 'application/pdf' }), 'carte-identite.pdf');
const up = await call('POST', `/account-requests/${requestId}/documents`, { token: applicant, form: fd });
ok(up.status === 200, 'upload accepted', 'got ' + up.status + ' ' + up.raw.slice(0, 200));
ok(up.body?.missingDocuments?.length === 4, 'now 4 documents missing', JSON.stringify(up.body?.missingDocuments));

const badType = new FormData();
badType.append('kind', 'tin');
badType.append('file', new Blob([Buffer.from('MZ\x90')], { type: 'application/x-msdownload' }), 'virus.exe');
const rejected = await call('POST', `/account-requests/${requestId}/documents`, { token: applicant, form: badType });
ok(rejected.status === 400 && rejected.body?.error?.code === 'UNSUPPORTED_FILE_TYPE',
  'an .exe upload is rejected', rejected.body?.error?.code);

console.log('\n=== 6. Admin login ===');
const adminLogin = await call('POST', '/auth/login', { body: { username: 'admin', password: ADMIN_PASSWORD } });
ok(adminLogin.status === 200, 'admin logs in');
ok(adminLogin.body?.scope === 'full', 'admin gets full scope');
ok(adminLogin.body?.company === null, 'admin has no company');
const admin = adminLogin.body.accessToken;

const queue = await call('GET', '/admin/account-requests?status=pending', { token: admin });
ok(queue.status === 200, 'admin sees the queue');
const found = queue.body?.items?.find((i) => i.id === requestId);
ok(!!found, 'our request is in the pending queue');
ok(found?.documentCount === 1, 'queue shows the uploaded document count', String(found?.documentCount));

const detail = await call('GET', `/admin/account-requests/${requestId}`, { token: admin });
ok(detail.status === 200, 'admin opens the request');
ok(detail.body?.company?.tin === '000216001234567', 'submitted TIN round-trips intact');
const docPath = detail.body?.documents?.[0]?.downloadPath;
ok(typeof docPath === 'string' && docPath.startsWith('/v1/admin/'),
  'document is exposed only via an authenticated admin path', docPath);

console.log('\n=== 7. Documents are not publicly readable ===');
const noAuthDoc = await fetch('http://localhost:3100' + docPath);
ok(noAuthDoc.status === 401, 'document download without a token -> 401', 'got ' + noAuthDoc.status);
const applicantDoc = await fetch('http://localhost:3100' + docPath, { headers: { Authorization: 'Bearer ' + applicant } });
ok(applicantDoc.status === 403, 'a customer cannot read KYC documents -> 403', 'got ' + applicantDoc.status);
const adminDoc = await fetch('http://localhost:3100' + docPath, { headers: { Authorization: 'Bearer ' + admin } });
ok(adminDoc.status === 200, 'admin can stream it');
ok((await adminDoc.text()).startsWith('%PDF'), 'and the bytes are what was uploaded');

console.log('\n=== 8. Live approval over SSE (the demo moment) ===');
const sseEvents = [];
const ac = new AbortController();
const ssePromise = (async () => {
  const res = await fetch(BASE + '/account-requests/mine/stream', {
    headers: { Authorization: 'Bearer ' + applicant },
    signal: ac.signal,
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.+)$/m.exec(frame);
      const da = /^data: (.+)$/m.exec(frame);
      if (ev && da) sseEvents.push({ event: ev[1], data: JSON.parse(da[1]) });
    }
  }
})().catch(() => {});

await new Promise((r) => setTimeout(r, 1200)); // let the stream connect
ok(sseEvents.some((e) => e.event === 'status'), 'stream sends current status on connect');

const approve = await call('POST', `/admin/account-requests/${requestId}/approve`, { token: admin });
ok(approve.status === 200 && approve.body?.status === 'approved', 'admin approves', JSON.stringify(approve.body));

await new Promise((r) => setTimeout(r, 1200)); // let the event land
const decision = sseEvents.find((e) => e.event === 'decision');
ok(!!decision, 'applicant received a live decision event without polling');
ok(decision?.data?.approvalStatus === 'approved', 'event says approved', JSON.stringify(decision?.data));
ac.abort();
await ssePromise;

console.log('\n=== 9. Approval upgrades the scope ===');
const refreshed = await call('POST', '/auth/refresh', { body: { refreshToken: applicantRefresh } });
ok(refreshed.status === 200, 'refresh succeeds');
ok(refreshed.body?.scope === 'full', 'scope upgraded to full after approval', refreshed.body?.scope);
ok(refreshed.body?.company?.creditLimit === 1250000, 'credit ceiling now visible: 1,250,000 DA', String(refreshed.body?.company?.creditLimit));
ok(refreshed.body?.company?.creditTermDays === 30, 'credit term 30 days', String(refreshed.body?.company?.creditTermDays));

console.log('\n=== 10. Refresh token rotation + reuse detection ===');
const replay = await call('POST', '/auth/refresh', { body: { refreshToken: applicantRefresh } });
ok(replay.status === 401 && replay.body?.error?.code === 'REFRESH_TOKEN_REUSED',
  'replaying a used refresh token is detected', replay.body?.error?.code);
const afterTheft = await call('POST', '/auth/refresh', { body: { refreshToken: refreshed.body.refreshToken } });
ok(afterTheft.status === 401, 'and it revoked every session for that user (theft response)', 'got ' + afterTheft.status);

console.log('\n=== 11. Double decision is refused ===');
const again = await call('POST', `/admin/account-requests/${requestId}/approve`, { token: admin });
ok(again.status === 400 && again.body?.error?.code === 'ALREADY_DECIDED',
  'approving twice -> ALREADY_DECIDED', again.body?.error?.code);

console.log('\n=== 12. Denial path ===');
const reg2 = await call('POST', '/auth/register', {
  body: {
    firstName: 'Denied', lastName: 'Applicant', username: 'denied_' + stamp,
    password: 'Chang3Me!2026', enterpriseName: 'EURL Refuse ' + stamp,
    enterpriseStatus: 'EURL', termsAccepted: true,
  },
});
const denyRes = await call('POST', `/admin/account-requests/${reg2.body.accountRequestId}/deny`, {
  token: admin, body: { reason: 'Registre de commerce illisible' },
});
ok(denyRes.status === 200 && denyRes.body?.status === 'denied', 'admin denies with a reason');
const deniedStatus = await call('GET', '/account-requests/mine', { token: reg2.body.accessToken });
ok(deniedStatus.body?.denialReason === 'Registre de commerce illisible',
  'applicant can read why they were denied', deniedStatus.body?.denialReason);
const denyNoReason = await call('POST', `/admin/account-requests/${requestId}/deny`, { token: admin, body: {} });
ok(denyNoReason.status === 400, 'denying without a reason is rejected', 'got ' + denyNoReason.status);

console.log('\n=== 13. Credit policy is admin-only ===');
const settings = await call('GET', '/admin/settings', { token: admin });
ok(settings.body?.credit_limit === 1250000, 'policy reports 1,250,000 DA');
const agentLogin = await call('POST', '/auth/login', { body: { username: 'admin', password: ADMIN_PASSWORD } });
ok(agentLogin.status === 200, 'sanity: admin can still log in');
const badPass = await call('POST', '/auth/login', { body: { username: 'admin', password: 'wrong' } });
ok(badPass.status === 401 && badPass.body?.error?.code === 'INVALID_CREDENTIALS',
  'wrong password -> INVALID_CREDENTIALS', badPass.body?.error?.code);
const noUser = await call('POST', '/auth/login', { body: { username: 'nope_' + stamp, password: 'wrong' } });
ok(noUser.body?.error?.code === 'INVALID_CREDENTIALS',
  'unknown user gives the SAME error (no username enumeration)', noUser.body?.error?.code);

console.log('\n=== 14. Token validation ===');
const garbage = await call('GET', '/me', { token: 'not.a.real.token' });
ok(garbage.status === 401 && garbage.body?.error?.code === 'INVALID_TOKEN', 'garbage token -> 401');
const noTok = await call('GET', '/me');
ok(noTok.status === 401 && noTok.body?.error?.code === 'MISSING_TOKEN', 'no token -> MISSING_TOKEN');

console.log('\n' + '='.repeat(56));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
