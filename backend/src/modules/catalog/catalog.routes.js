// Catalog routes. Schemas are declared inline because Fastify compiles the
// response schema into a specialised serialiser — that is where its speed
// advantage actually comes from, so skipping it would waste the framework.

import { getCatalog, getProduct } from './catalog.service.js';
import { notFound } from '../../lib/errors.js';

const bilingualName = {
  type: 'object',
  properties: { en: { type: 'string' }, fr: { type: 'string' } },
};

const product = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    sku: { type: 'string' },
    model: { type: 'string' },
    size: { type: ['string', 'null'] },
    loadSpeedIndex: { type: ['string', 'null'] },
    displayName: { type: 'string' },
    imageUrl: { type: 'string' },
    unitPrice: { type: 'number' },
    vatRate: { type: 'number' },
    inStock: { type: 'boolean' },
  },
};

const brand = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    logoUrl: { type: ['string', 'null'] },
    productCount: { type: 'integer' },
    products: { type: 'array', items: product },
  },
};

// The category tree is recursive; JSON Schema needs a $ref with an $id for that.
const category = {
  $id: 'category',
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: bilingualName,
    icon: { type: ['string', 'null'] },
    brands: { type: 'array', items: brand },
    children: { type: 'array', items: { $ref: 'category#' } },
  },
};

export default async function catalogRoutes(app) {
  app.addSchema(category);

  app.get(
    '/catalog',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Whole catalog tree, both languages, one request',
        description:
          'Cached in-process for 60s and served under an ETag. Send If-None-Match ' +
          'to get a 304 with no body. See docs/BACKEND-DESIGN.md §5.1.',
        response: {
          200: {
            type: 'object',
            properties: {
              generatedAt: { type: 'string' },
              categories: { type: 'array', items: { $ref: 'category#' } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { payload, etag, cached } = await getCatalog(app.prisma);

      reply
        .header('ETag', etag)
        .header('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
        .header('X-Cache', cached ? 'HIT' : 'MISS');

      // Unchanged since the client last asked: 304, empty body, no serialisation.
      if (req.headers['if-none-match'] === etag) {
        return reply.code(304).send();
      }

      return payload;
    },
  );

  app.get(
    '/products/:id',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Live product detail, including exact stock (never cached)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      const p = await getProduct(app.prisma, req.params.id);
      if (!p) throw notFound('PRODUCT_NOT_FOUND', 'No such product');

      reply.header('Cache-Control', 'no-store'); // stock must not be cached
      return p;
    },
  );
}
