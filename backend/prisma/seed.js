// Seed — every value here is lifted from the existing frontend, nothing is
// invented. Prices are TTC (§10.4). Products the screens marked
// `available: false` get quantity 0; the rest get realistic stock so the
// INSUFFICIENT_STOCK path is actually demonstrable.
//
// Idempotent: safe to re-run. `npm run seed`

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const prisma = new PrismaClient();
const ASSETS = process.env.PUBLIC_ASSET_BASE_URL || 'http://localhost:3000/static';

// ---------------------------------------------------------------------------
// Catalog taxonomy
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { slug: 'tires', nameEn: 'Tires', nameFr: 'Pneus', icon: null, parent: null, sortOrder: 1 },
  { slug: 'light-tires', nameEn: 'Light Tires', nameFr: 'Pneus tourisme', icon: 'car', parent: 'tires', sortOrder: 1 },
  { slug: 'heavy-tires', nameEn: 'Heavy Tires', nameFr: 'Pneus poids lourd', icon: 'truck', parent: 'tires', sortOrder: 2 },
  { slug: 'agricultural-tires', nameEn: 'Agricultural Tires', nameFr: 'Pneus agricoles', icon: 'tractor', parent: 'tires', sortOrder: 3 },
  { slug: 'lubricants', nameEn: 'Lubricants', nameFr: 'Lubrifiants', icon: 'oil-can', parent: null, sortOrder: 2 },
];

const BRANDS = [
  { slug: 'iris', name: 'IRIS', logo: 'Iris.png', sortOrder: 1 },
  { slug: 'continental', name: 'Continental', logo: 'Continental.png', sortOrder: 2 },
  { slug: 'semperit', name: 'Semperit', logo: 'semperit.png', sortOrder: 3 },
  { slug: 'naftal', name: 'Naftal', logo: null, sortOrder: 4 },
  { slug: 'total', name: 'Total', logo: null, sortOrder: 5 },
];

// Iris is deliberately mapped to agricultural-tires with zero products: that is
// what drives productnf.js honestly, instead of the hardcoded `case 'IrisA'`.
const BRAND_CATEGORIES = [
  ['iris', 'light-tires'], ['continental', 'light-tires'], ['semperit', 'light-tires'],
  ['iris', 'heavy-tires'], ['continental', 'heavy-tires'], ['semperit', 'heavy-tires'],
  ['iris', 'agricultural-tires'], ['continental', 'agricultural-tires'], ['semperit', 'agricultural-tires'],
  ['naftal', 'lubricants'], ['total', 'lubricants'],
];

// ---------------------------------------------------------------------------
// Products — model | size | loadSpeedIndex | price (TTC, DA) | stock | image
// ---------------------------------------------------------------------------

const P = (category, brand, sku, model, size, loadSpeedIndex, price, quantity, image) =>
  ({ category, brand, sku, model, size, loadSpeedIndex, price, quantity, image });

const PRODUCTS = [
  // --- Light tires (Light-T/Tires-brands/*.js) ----------------------------
  P('light-tires', 'continental', 'CO-ULTRACONTACT-2255518', 'ULTRACONTACT', '225/55 R 18', null, 13500, 24, 'Continental/ultracontact.png'),
  P('light-tires', 'continental', 'CO-ALLSC2-2255518', 'ALL-S-C2', '225/55 R 18', null, 15500, 0, 'Continental/allseasoncontact2.png'),
  P('light-tires', 'continental', 'CO-WINTERC-2255518', 'WINTER-C', '225/55 R 18', null, 17000, 12, 'Continental/wintercontact.png'),
  P('light-tires', 'iris', 'IR-AURES-2255518', 'AURES', '225/55 R 18', null, 9200, 40, 'Iris/aures.png'),
  P('light-tires', 'iris', 'IR-ECORIS-2255518', 'ECORIS', '225/55 R 18', null, 8700, 36, 'Iris/ecoris.png'),
  P('light-tires', 'iris', 'IR-STORMY-2255518', 'STORMY', '225/55 R 18', null, 11000, 18, 'Iris/stormy.png'),
  P('light-tires', 'semperit', 'SE-SPEEDLIFE2-2255518', 'SPEED-LIFE2', '225/55 R 18', null, 8400, 30, 'Semperit/speedlife2.png'),
  P('light-tires', 'semperit', 'SE-COMFORTL2-2255518', 'COMFORT-L2', '225/55 R 18', null, 7800, 28, 'Semperit/comfortlife.png'),
  P('light-tires', 'semperit', 'SE-MASTERGRIP2-2255518', 'MASTER-GRIP2', '225/55 R 18', null, 9200, 15, 'Semperit/mastergrip.png'),

  // --- Heavy tires (Heavy-T/Tires-Brands/*.js) ---------------------------
  P('heavy-tires', 'continental', 'CO-HDL3EP-11R225', 'HDL-3-EP', '11 R 22.5', '144/142L', 13500, 16, 'Continental/CHDL3EP_L3Q.png'),
  P('heavy-tires', 'continental', 'CO-HAU5-30585R225', 'HAU-5', '305/85 R 22.5', '152/149K', 15500, 0, 'Continental/CHAU5_L3Q.png'),
  P('heavy-tires', 'continental', 'CO-HCS-44565R225', 'HCS', '445/65 R 22.5', '169K', 17000, 8, 'Continental/HCS.png'),
  P('heavy-tires', 'iris', 'IR-LANELT-21575R16', 'LANE-LT', '215/75 R 16', null, 9200, 22, 'Iris/lane.png'),
  P('heavy-tires', 'semperit', 'SE-RUNNERT3-2255518', 'RUNNER-T3', '225/55 R 18', null, 8400, 20, 'Semperit/Semperit__RUNNER_T3__ProductPicture__30.png'),
  P('heavy-tires', 'semperit', 'SE-RUNNERF2-2255518', 'RUNNER-F2', '225/55 R 18', null, 7800, 26, 'Semperit/Semperit__RUNNER_F2__ProductPicture__30.png'),
  P('heavy-tires', 'semperit', 'SE-RUNNERD2-2255518', 'RUNNER-D2', '225/55 R 18', null, 9200, 14, 'Semperit/Semperit__RUNNER_D2__ProductPicture__30.png'),

  // --- Agricultural tires (Agriculture/Tire-Brands/*.js) -----------------
  P('agricultural-tires', 'continental', 'CO-TRACTOR85-48080R50', 'TRACTOR85', '480/80 R 50', null, 13500, 6, 'Continental/Continental__Tractor85__ProductPicture__30__380_85_R_28.png'),
  P('agricultural-tires', 'continental', 'CO-COMBINEMASTER-90060R38', 'COMBINEMASTER', '900/60 R 38', null, 15500, 0, 'Continental/CO_CombineMaster_ProductPicture_30.png'),
  P('agricultural-tires', 'continental', 'CO-MPT81', 'MPT81', null, null, 17000, 9, 'Continental/CO_MPT_81_ProductPicture_30.png'),
  P('agricultural-tires', 'semperit', 'SE-WORKERF2-2255518', 'WORKER-F2', '225/55 R 18', null, 8400, 11, 'Semperit/Semperit__WORKER_F2__ProductPicture__30.png'),
  P('agricultural-tires', 'semperit', 'SE-WORKERT2-2255518', 'WORKER-T2', '225/55 R 18', null, 7800, 13, 'Semperit/Semperit__WORKER_T2__ProductPicture__30.png'),

  // --- Lubricants (screens/lubricant.js) ---------------------------------
  P('lubricants', 'naftal', 'NA-NAFTALIA-SUPER', 'Naftalia Super', null, null, 7800, 50, 'Lubricant/naftaliasup.png'),
  P('lubricants', 'total', 'TO-QUARTZ', 'Total Quartz', null, null, 7800, 45, 'Lubricant/quartz.png'),
  P('lubricants', 'total', 'TO-RUBIA', 'Total Rubia', null, null, 7800, 42, 'Lubricant/rubia.png'),
];

// displayName reproduces exactly what the cards show today
const displayNameOf = (p) =>
  [p.model, p.size, p.loadSpeedIndex].filter(Boolean).join(' ');

// ---------------------------------------------------------------------------

async function main() {
  console.log('seeding...');

  // --- policy: the credit ceiling is Naftal-wide, not per-company. §3.1 ---
  const settings = [
    ['credit_limit', 1250000],
    ['credit_term_days', 30],
    ['vat_rate', 0.19],
    ['price_display_mode', 'TTC'],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // --- categories (parents first, so parentId can resolve) ---------------
  const catId = {};
  for (const c of CATEGORIES.filter((c) => !c.parent)) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { nameEn: c.nameEn, nameFr: c.nameFr, icon: c.icon, sortOrder: c.sortOrder },
      create: { slug: c.slug, nameEn: c.nameEn, nameFr: c.nameFr, icon: c.icon, sortOrder: c.sortOrder },
    });
    catId[c.slug] = row.id;
  }
  for (const c of CATEGORIES.filter((c) => c.parent)) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { nameEn: c.nameEn, nameFr: c.nameFr, icon: c.icon, sortOrder: c.sortOrder, parentId: catId[c.parent] },
      create: { slug: c.slug, nameEn: c.nameEn, nameFr: c.nameFr, icon: c.icon, sortOrder: c.sortOrder, parentId: catId[c.parent] },
    });
    catId[c.slug] = row.id;
  }

  // --- brands ------------------------------------------------------------
  const brandId = {};
  for (const b of BRANDS) {
    const logoUrl = b.logo ? `${ASSETS}/${b.logo}` : null;
    const row = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: { name: b.name, logoUrl, sortOrder: b.sortOrder },
      create: { slug: b.slug, name: b.name, logoUrl, sortOrder: b.sortOrder },
    });
    brandId[b.slug] = row.id;
  }

  for (const [b, c] of BRAND_CATEGORIES) {
    await prisma.brandCategory.upsert({
      where: { brandId_categoryId: { brandId: brandId[b], categoryId: catId[c] } },
      update: {},
      create: { brandId: brandId[b], categoryId: catId[c], sortOrder: BRANDS.find((x) => x.slug === b).sortOrder },
    });
  }

  // --- products + stock --------------------------------------------------
  for (const p of PRODUCTS) {
    const data = {
      categoryId: catId[p.category],
      brandId: brandId[p.brand],
      model: p.model,
      size: p.size,
      loadSpeedIndex: p.loadSpeedIndex,
      displayName: displayNameOf(p),
      imageUrl: `${ASSETS}/${p.image}`,
      unitPrice: p.price,
      vatRate: 0.19,
      status: 'active',
    };
    const row = await prisma.product.upsert({
      where: { sku: p.sku },
      update: data,
      create: { sku: p.sku, ...data },
    });
    await prisma.productStock.upsert({
      where: { productId: row.id },
      update: { quantity: p.quantity },
      create: { productId: row.id, quantity: p.quantity },
    });
  }

  // --- Naftal staff ------------------------------------------------------
  //
  // No hardcoded default. This file is public, so a literal here would be a
  // known password on every deployment whose author forgot to change it. In
  // production the seed refuses to invent one; in development it generates a
  // random password and prints it once.
  if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
    throw new Error('SEED_ADMIN_PASSWORD must be set when seeding in production');
  }
  const generated = !process.env.SEED_ADMIN_PASSWORD;
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ||
    randomBytes(12).toString('base64url'); // ~96 bits
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {}, // never reset a password that already exists
    create: {
      username: 'admin',
      passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      firstName: 'Naftal',
      lastName: 'Admin',
      email: 'admin@naftal.local',
      role: 'admin',
    },
  });

  const counts = {
    categories: await prisma.category.count(),
    brands: await prisma.brand.count(),
    products: await prisma.product.count(),
    settings: await prisma.appSetting.count(),
  };
  console.log('done:', counts);

  if (existingAdmin) {
    console.log('admin user already existed - password left unchanged');
  } else if (generated) {
    console.log('');
    console.log('  admin password (generated, shown once): ' + adminPassword);
    console.log('  set SEED_ADMIN_PASSWORD in .env to choose your own');
    console.log('');
  } else {
    console.log('admin created with SEED_ADMIN_PASSWORD');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
