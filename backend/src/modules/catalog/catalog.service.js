// Catalog read path.
//
// The whole catalog is a few kilobytes (24 products, 3 brands, 5 categories), so
// it is assembled once, cached in-process, and served under an ETag. After the
// first request, browsing Tires -> Light -> Continental -> a product touches no
// network at all. §5.1
//
// Both languages ship in the same payload: serving one language per request
// would need `Vary: Accept-Language` and two cache entries each getting half the
// hits, and would make the in-app FR/EN toggle refetch everything. §4.1

import { createHash } from 'node:crypto';
import { dec } from '../../lib/money.js';

const TTL_MS = 60_000;

/** Module-level cache. One process, one catalog. */
let cache = { payload: null, etag: null, builtAt: 0 };

/** Called whenever an admin changes a price, a product or a category. */
export function invalidateCatalog() {
  cache = { payload: null, etag: null, builtAt: 0 };
}

function etagFor(payload) {
  return '"' + createHash('sha1').update(JSON.stringify(payload)).digest('base64url') + '"';
}

/**
 * Three queries total, never N+1: categories, brands+links, then products with
 * their stock. The tree is assembled in memory, which at this size costs
 * microseconds and saves a recursive CTE.
 */
async function build(prisma) {
  const [categories, brandLinks, products] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] }),
    prisma.brandCategory.findMany({
      include: { brand: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.product.findMany({
      where: { status: 'active' },
      include: { stock: true },
      orderBy: [{ brandId: 'asc' }, { model: 'asc' }],
    }),
  ]);

  // product_count and in-stock flags, keyed for O(1) lookup while building
  const byCategoryBrand = new Map();
  for (const p of products) {
    const key = p.categoryId + '|' + p.brandId;
    if (!byCategoryBrand.has(key)) byCategoryBrand.set(key, []);
    byCategoryBrand.get(key).push({
      id: p.id,
      sku: p.sku,
      model: p.model,
      size: p.size,
      loadSpeedIndex: p.loadSpeedIndex,
      displayName: p.displayName,
      imageUrl: p.imageUrl,
      unitPrice: dec(p.unitPrice), // TTC
      vatRate: dec(p.vatRate),
      // 60s of staleness is harmless on a card; the order transaction is the
      // only place stock has to be exactly right. §5.2
      inStock: (p.stock?.quantity ?? 0) > 0,
    });
  }

  const brandsByCategory = new Map();
  for (const link of brandLinks) {
    if (!brandsByCategory.has(link.categoryId)) brandsByCategory.set(link.categoryId, []);
    const items = byCategoryBrand.get(link.categoryId + '|' + link.brandId) ?? [];
    brandsByCategory.get(link.categoryId).push({
      id: link.brand.id,
      slug: link.brand.slug,
      name: link.brand.name, // proper noun, not translated
      logoUrl: link.brand.logoUrl,
      // Lets the app route to the empty state because there genuinely are no
      // products, instead of hardcoding it for Iris/Agricultural. §8
      productCount: items.length,
      products: items,
    });
  }

  const node = (c) => ({
    id: c.id,
    slug: c.slug,
    name: { en: c.nameEn, fr: c.nameFr },
    icon: c.icon,
    children: categories.filter((x) => x.parentId === c.id).map(node),
    brands: brandsByCategory.get(c.id) ?? [],
  });

  return {
    generatedAt: new Date().toISOString(),
    categories: categories.filter((c) => c.parentId === null).map(node),
  };
}

/** Cached catalog + its ETag. */
export async function getCatalog(prisma) {
  const fresh = cache.payload && Date.now() - cache.builtAt < TTL_MS;
  if (fresh) return { payload: cache.payload, etag: cache.etag, cached: true };

  const payload = await build(prisma);
  cache = { payload, etag: etagFor(payload), builtAt: Date.now() };
  return { payload, etag: cache.etag, cached: false };
}

/** Live product detail — never cached: the detail screen validates quantity. */
export async function getProduct(prisma, id) {
  // relationLoadStrategy 'join' collapses what Prisma would otherwise run as
  // four separate SELECTs wrapped in a transaction (7 round trips) into one
  // query. At ~234ms of latency to Neon that is 518ms -> ~240ms. §5.11
  const p = await prisma.product.findFirst({
    relationLoadStrategy: 'join',
    where: { id, status: 'active' },
    include: { stock: true, brand: true, category: true },
  });
  if (!p) return null;

  return {
    id: p.id,
    sku: p.sku,
    model: p.model,
    size: p.size,
    loadSpeedIndex: p.loadSpeedIndex,
    displayName: p.displayName,
    imageUrl: p.imageUrl,
    unitPrice: dec(p.unitPrice),
    vatRate: dec(p.vatRate),
    brand: { slug: p.brand.slug, name: p.brand.name },
    category: {
      slug: p.category.slug,
      name: { en: p.category.nameEn, fr: p.category.nameFr },
    },
    stockQuantity: p.stock?.quantity ?? 0,
    inStock: (p.stock?.quantity ?? 0) > 0,
  };
}
