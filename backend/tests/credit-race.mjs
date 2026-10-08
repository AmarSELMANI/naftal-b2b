// Does the FOR UPDATE lock actually stop two concurrent orders from both
// passing the same credit check?
//
// Setup: give the company a 50,000 DA ceiling, then fire 5 orders of 27,000 DA
// at the same instant. 50,000 / 27,000 = 1.85, so EXACTLY ONE may succeed.
// Without the lock, several would read the same outstanding balance of 0, all
// conclude they fit, and all commit.

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const p = new PrismaClient();
const CONCURRENCY = 5;
const CEILING = 50000;

const company = await p.company.findFirst({
  where: { approvalStatus: 'approved' },
  include: { users: { take: 1 } },
});
const product = await p.product.findFirst({ where: { sku: 'CO-ULTRACONTACT-2255518' } });

// Clean slate: a low ceiling and no prior credit orders for this company.
await p.order.deleteMany({ where: { companyId: company.id } });
await p.company.update({ where: { id: company.id }, data: { creditLimit: CEILING } });
await p.productStock.update({ where: { productId: product.id }, data: { quantity: 500 } });

const unit = Number(product.unitPrice);
const perOrder = unit * 2;
console.log(`company ceiling : ${CEILING.toLocaleString()} DA`);
console.log(`each order      : ${perOrder.toLocaleString()} DA  (2 x ${unit.toLocaleString()})`);
console.log(`firing          : ${CONCURRENCY} orders simultaneously`);
console.log(`max that fit    : ${Math.floor(CEILING / perOrder)}\n`);

const items = JSON.stringify([{ product_id: product.id, quantity: 2 }]);

const results = await Promise.allSettled(
  Array.from({ length: CONCURRENCY }, () =>
    p.$queryRawUnsafe(
      'SELECT * FROM place_order($1::uuid, $2::uuid, $3::jsonb, $4)',
      company.id, company.users[0].id, items, 'credit',
    ),
  ),
);

let ok = 0, rejected = 0;
const reasons = {};
for (const r of results) {
  if (r.status === 'fulfilled') { ok++; continue; }
  rejected++;
  const msg = String(r.reason?.message ?? '').match(/CREDIT_LIMIT_EXCEEDED|INSUFFICIENT_STOCK|\w+/)?.[0] ?? 'unknown';
  reasons[msg] = (reasons[msg] ?? 0) + 1;
}

const committed = await p.order.findMany({
  where: { companyId: company.id, paymentType: 'credit' },
  select: { orderNo: true, total: true },
});
const owed = committed.reduce((s, o) => s + Number(o.total), 0);

console.log(`succeeded : ${ok}`);
console.log(`rejected  : ${rejected}  ${JSON.stringify(reasons)}`);
console.log(`committed : ${committed.map((o) => o.orderNo).join(', ') || '(none)'}`);
console.log(`total owed: ${owed.toLocaleString()} DA`);
console.log();

const withinCeiling = owed <= CEILING;
const exactlyExpected = ok === Math.floor(CEILING / perOrder);
console.log(withinCeiling ? 'PASS  company is within its ceiling' : `FAIL  company is ${(owed - CEILING).toLocaleString()} DA OVER its ceiling`);
console.log(exactlyExpected ? 'PASS  exactly the right number of orders committed' : `FAIL  expected ${Math.floor(CEILING / perOrder)} to commit, got ${ok}`);

// restore
await p.order.deleteMany({ where: { companyId: company.id } });
await p.company.update({ where: { id: company.id }, data: { creditLimit: null } });
await p.$disconnect();
process.exit(withinCeiling && exactlyExpected ? 0 : 1);
