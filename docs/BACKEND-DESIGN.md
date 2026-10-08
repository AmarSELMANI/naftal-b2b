# Naftal B2B — Backend Design

> Status: **design settled** — the five open questions are answered in §10. Ready to build Phase 0.
> Stack decided: Node 20 + Fastify + PostgreSQL (Neon) + Prisma · deployed to free cloud · separate web admin panel.

---

## 1. What the app actually does

Read off the existing frontend, the product is a **private B2B ordering channel for Naftal**: enterprises apply for an account, a Naftal agent approves them, and they then order tires and lubricants either paying immediately or **on credit against a company credit ceiling**.

That one sentence drives the whole backend, because it means this is not a shop — it is a **small credit system with a catalog attached**. Money and credit correctness matter more than catalog features.

Flows in the current UI:

| Screen | Today | Needs from backend |
|---|---|---|
| `Register.js` | 8 fields + document picker, submits nothing | create company + user as `pending`, accept 5 documents |
| `Wait.js` | `isApproved: true` hardcoded | real approval status, ideally pushed live |
| `Login.js` | `navigation.replace('Drawer')`, no check | authenticate, block non-approved accounts |
| `tires.js` → brands → brand screens | 8 files of `const` arrays, 24 products | catalog API |
| `ProductDetail.js` | `if (total > 1250000)` hardcoded | real credit ceiling, real stock, real order creation |
| `orders.js` | 2 mock orders, client-side date math | real orders, server-computed days-left |
| `productnf.js` | reached by a hardcoded route for Iris/Agricultural | reached when `product_count === 0` |

---

## 2. Architecture

```
┌──────────────────┐        ┌──────────────────┐
│  Expo RN app     │        │  Admin panel     │
│  (customers)     │        │  Vite + React    │
└────────┬─────────┘        └────────┬─────────┘
         │  HTTPS / JSON              │
         └─────────────┬──────────────┘
                       ▼
          ┌────────────────────────────┐
          │   Fastify API  (/v1)       │
          │  ┌──────────────────────┐  │
          │  │ auth · onboarding    │  │
          │  │ catalog · orders     │  │
          │  │ credit · payments    │  │
          │  │ admin · notifications│  │
          │  └──────────────────────┘  │
          │  JSON-Schema validation    │
          │  in-process catalog cache  │
          └───────┬─────────────┬──────┘
                  │             │
         ┌────────▼──────┐  ┌───▼────────────────┐
         │ PostgreSQL    │  │ Cloudflare R2      │
         │ (Neon)        │  │ • product images   │
         │               │  │   (public, CDN)    │
         │               │  │ • KYC documents    │
         │               │  │   (private+signed) │
         └───────────────┘  └────────────────────┘
```

**Modular monolith**, organised by feature, not by technical layer. One deployable, no microservice overhead — the correct choice at this scale, and defensible: *"I split by business capability so a module can be extracted later, but shipping one process keeps latency and ops cost at zero."*

```
backend/
  src/
    server.js                  fastify bootstrap
    config/env.js              env validated at boot (fail fast, never undefined)
    plugins/                   prisma · auth · cors · helmet · rate-limit · compress · swagger
    modules/
      auth/                    auth.routes.js · auth.service.js · auth.schemas.js
      onboarding/              registration + document upload + status stream
      catalog/                 categories · brands · products · cache
      orders/                  order placement transaction
      credit/                  limit + outstanding computation
      payments/                payment declaration & confirmation
      admin/                   approval queue · stock · price · order status
      notifications/           expo push tokens + dispatch
    lib/                       errors · money · keyset-pagination · idempotency · storage
  prisma/
    schema.prisma · migrations/ · seed.js
  tests/
admin-web/                     Vite + React + React Query
```

Each module is three files: `routes` (HTTP + schema only), `service` (business rules, no HTTP objects — unit-testable), and Prisma calls. Services never import Fastify; routes never contain an `if` about money.

**Why Fastify over NestJS/Express:** Fastify compiles your JSON schemas into specialised serialisers (`fast-json-stringify`), a measurable 2–3× on response serialisation, and its plugin/encapsulation model gives the structure NestJS gives without the decorator and DI overhead. Express gives neither validation nor fast serialisation and is the slowest of the three.

---

## 3. Data model

```
companies ──1:N── users ──1:N── orders ──1:N── order_items ──N:1── products
    │                             │                                    │
    │                             └──1:N── payments                 1:1│
    │                                                           product_stock
    └──1:N── account_requests ──1:N── documents

categories (self-referencing tree)        brands ──N:M── categories
```

### 3.1 Identity & onboarding

```sql
companies
  id                uuid        pk default gen_random_uuid()
  name              text        not null                    -- "Enterprise Name"
  legal_form        text                                    -- "Enterprise status": SARL / EURL / SPA / ETS
  trade_register_no text                                    -- RC
  tin               text                                    -- NIF
  address           text
  phone             text
  email             citext
  credit_limit      numeric(14,2)                           -- NULL ⇒ use the Naftal-wide ceiling
  credit_term_days  int                                     -- NULL ⇒ use the Naftal-wide term
  approval_status   company_status not null default 'pending'  -- pending|approved|denied|suspended
  created_at        timestamptz not null default now()
  updated_at        timestamptz not null default now()

users
  id            uuid pk
  company_id    uuid references companies(id)               -- null for Naftal staff
  username      citext      not null unique
  password_hash text        not null                        -- argon2id
  first_name    text        not null                        -- "Name"
  last_name     text        not null                        -- "Surname"
  email         citext      unique
  phone         text
  role          user_role   not null default 'customer'     -- customer|agent|admin
  is_active     boolean     not null default true
  last_login_at timestamptz
  created_at    timestamptz not null default now()

account_requests
  id                uuid pk
  company_id        uuid not null references companies(id)
  submitted_by      uuid not null references users(id)
  status            request_status not null default 'pending'   -- pending|approved|denied
  terms_accepted_at timestamptz not null
  decided_by        uuid references users(id)
  decided_at        timestamptz
  denial_reason     text
  created_at        timestamptz not null default now()

documents
  id                  uuid pk
  account_request_id  uuid not null references account_requests(id) on delete cascade
  kind                document_kind not null
        -- id_card | proof_of_address | business_registration | tin | bank_statement
  storage_key         text not null        -- R2 object key; bucket is PRIVATE
  file_name           text not null
  mime_type           text not null
  size_bytes          integer not null
  uploaded_at         timestamptz not null default now()
  unique (account_request_id, kind)

app_settings                -- one row per policy knob; Naftal-wide, never per-company
  key         text pk       -- 'credit_limit' | 'credit_term_days' | 'vat_rate' | 'price_display_mode'
  value       jsonb not null
  updated_by  uuid references users(id)
  updated_at  timestamptz not null default now()
```

**The credit ceiling is Naftal policy, not an agent's decision.** The 1,250,000 DA lives in `app_settings`, editable only by role `admin` — an `agent` approving an account cannot grant a different limit, and the approval form has no credit field on it at all. `companies.credit_limit` survives as a *nullable* override that is `NULL` for every company: it costs nothing today, it keeps the value on the row the day Naftal does grant one key client a higher ceiling, and it means a policy change is a single settings update rather than an `UPDATE` sweeping every company row.

**Design note — why the company/user row is created immediately as `pending`**, rather than parking the form payload in a request table: username and email uniqueness get enforced at submission time (the applicant learns immediately that a username is taken, instead of after a two-day review), and a pending applicant can authenticate just enough to poll their own decision — which is exactly what `Wait.js` needs.

`account_requests` still exists, because it is the admin queue *and* the decision audit trail (who approved, when, why denied), and because a suspended company can re-apply, producing a second request row. Cost of this choice: denied applications leave rows in `companies`/`users`. Accepted — they *are* the record of the denial, and a retention job can purge them after N months.

### 3.2 Catalog

```sql
categories                  -- tree: Tires → {Light, Heavy, Agricultural}; Lubricants (leaf)
  id uuid pk
  parent_id uuid references categories(id)
  slug text not null unique    -- 'tires' | 'light-tires' | 'heavy-tires' | 'agricultural-tires' | 'lubricants'
  name_en text not null
  name_fr text not null
  icon text                    -- 'car' | 'truck' | 'tractor'  (FontAwesome5 names already in tires.js)
  sort_order int not null default 0

brands
  id uuid pk
  slug text not null unique    -- 'iris' | 'continental' | 'semperit'
  name text not null
  logo_url text
  sort_order int not null default 0

brand_categories            -- which brands are carried in which category
  brand_id uuid references brands(id)
  category_id uuid references categories(id)
  primary key (brand_id, category_id)

products
  id               uuid pk
  sku              text not null unique      -- 'CO-ULTRACONTACT-225-55-R18'
  category_id      uuid not null references categories(id)   -- always a LEAF category
  brand_id         uuid not null references brands(id)
  model            text not null             -- 'ULTRACONTACT'
  size             text                      -- '225/55 R 18'   (null for lubricants)
  load_speed_index text                      -- '144/142L'      (heavy tires only)
  display_name     text not null             -- exactly what the card shows today
  image_url        text not null
  unit_price       numeric(12,2) not null    -- DA, TTC (tax included) = the number the card shows
  vat_rate         numeric(4,3) not null default 0.190        -- TVA 19%, extracted FROM unit_price
  status           product_status not null default 'active'   -- active|discontinued|hidden
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()

product_stock               -- separate table, on purpose (see §5.2)
  product_id uuid pk references products(id) on delete cascade
  quantity   integer not null default 0 check (quantity >= 0)
  updated_at timestamptz not null default now()
```

Only `categories` carry both languages. Brands (`Continental`, `Semperit`, `Iris`) and product models (`ULTRACONTACT`, `RUNNER-T3`) are proper nouns and are never translated — translating a tire model would be wrong, not helpful. Everything else the user reads in two languages is a *label on an enum* (`immediate` → "Achat immédiat" / "Pay now"), which belongs in the app's translation files, not in the database. See §4.1.

`model` and `size` are stored **split**, not as one string. Today `Card.js` does `name.split(' ')[0]` and `name.split(' ').slice(1).join(' ')` to render the card's two lines — a presentation hack that breaks on `MPT81` (no size at all) and on the heavy-tire names that carry a load index. Splitting at the source fixes the cards *and* unlocks the single most valuable feature a tire catalog can have: **search by size** ("I need 225/55 R 18"), which no screen can offer today.

**Money is `numeric`, never `float`.** `0.1 + 0.2 ≠ 0.3` in binary floating point, and a credit ceiling must not drift by centimes.

### 3.3 Orders, payments, credit

```sql
orders
  id             uuid pk
  order_no       text not null unique      -- 'CMD-2026-000123'  (keeps the CMD prefix orders.js shows)
  company_id     uuid not null references companies(id)
  placed_by      uuid not null references users(id)
  status         order_status  not null default 'confirmed'
        -- confirmed | preparing | shipped | delivered | cancelled
  payment_type   payment_type  not null    -- 'immediate' | 'credit'
  subtotal       numeric(14,2) not null    -- HT,  = total / (1 + vat_rate)
  vat_amount     numeric(14,2) not null    -- TVA, = total - subtotal
  total          numeric(14,2) not null    -- TTC, = SUM(unit_price x qty) = what the app displayed
  amount_paid    numeric(14,2) not null default 0
  payment_state  payment_state not null default 'unpaid'    -- unpaid|partially_paid|paid
  due_date       date                      -- credit orders only
  created_at timestamptz not null default now()

order_items
  id             uuid pk
  order_id       uuid not null references orders(id) on delete cascade
  product_id     uuid not null references products(id)
  quantity       integer not null check (quantity > 0)
  unit_price     numeric(12,2) not null    -- SNAPSHOT at order time
  line_total     numeric(14,2) not null
  name_snapshot  text not null             -- order history survives a product rename
  image_snapshot text

payments
  id           uuid pk
  order_id     uuid not null references orders(id)
  company_id   uuid not null references companies(id)
  method       payment_method not null     -- card | cheque | cash | bank_transfer
  amount       numeric(14,2) not null check (amount > 0)
  status       payment_status not null default 'declared'   -- declared|confirmed|rejected
  reference    text                        -- cheque no. / transfer ref
  declared_at  timestamptz not null default now()
  confirmed_at timestamptz
  confirmed_by uuid references users(id)
```

Three deliberate decisions here.

**Orders have items, even though the app buys one product at a time.** `ProductDetail.js` confirms a single product, so `orders` could carry `product_id` + `quantity` directly. Modelling `order_items` costs one extra table now and saves a destructive migration the day you add a cart — and a B2B buyer ordering 4 tires plus 2 cans of oil in one delivery is the obvious next feature. The API accepts an `items` array of length 1 today; nothing in the app changes when it becomes length 5.

**`unit_price` and `name_snapshot` are copied into `order_items`.** If a Continental price rises next month, a customer reopening a March order must still see what they actually paid. Joining live `products.unit_price` into order history is a correctness bug, not an optimisation.

**Payments are *declared*, then *confirmed*.** There is no real payment gateway — CIB/Edahabia integration needs a Naftal merchant account you do not have. Rather than fake one, the model matches how this genuinely works for B2B in Algeria: the customer declares "cheque no. 4471, 184,000 DA", a Naftal agent confirms receipt in the admin panel, and only then does `amount_paid` move and the credit free up. Cash and cheque work *exactly* this way in reality, so this is not a mock standing in for the real thing — it is the real workflow. Card is the only method that would later swap in a gateway callback.

### 3.4 Supporting tables

```sql
device_tokens      -- id, user_id, expo_push_token unique, platform, last_seen_at
notifications      -- id, user_id, type, title, body, data jsonb, read_at, created_at
idempotency_keys   -- key pk, user_id, endpoint, request_hash,
                   -- response_body jsonb, status_code, created_at   (see §5.5)
audit_log          -- id, actor_user_id, action, entity_type, entity_id,
                   -- before jsonb, after jsonb, ip, created_at
```

`audit_log` is not ceremony in a credit system: approvals, credit-limit changes, price changes and payment confirmations all need to be attributable to a person. It is also the cheapest possible answer to a jury question about accountability.

---

## 4. API surface (`/v1`)

All JSON. Errors are uniform:

```json
{ "error": { "code": "CREDIT_LIMIT_EXCEEDED", "message": "…", "details": { "available": 310000 } } }
```

The machine-readable `code` matters: `ProductDetail.js` must react differently to `INSUFFICIENT_STOCK` than to `CREDIT_LIMIT_EXCEEDED`, and must never string-match an English sentence to decide.

### 4.1 How bilingual works on the wire

The API is **language-agnostic**: it returns both `name_en` and `name_fr` for categories, and bare enum *keys* (`credit`, `cheque`, `overdue`, `preparing`) for everything else. The app owns the labels.

This is a deliberate choice over the usual `Accept-Language` approach, for one concrete reason: `/catalog` is cached behind an ETag (§5.1). Serving one language per request would need `Vary: Accept-Language` and **two** cache entries that each get half the hit rate. Shipping both languages costs a few hundred extra bytes in a payload that is already a few kilobytes, keeps **one** cache entry, and — the real win — lets the user flip FR/EN instantly with no refetch, because the phone already holds both.

The same rule makes error handling correct: the client localises from `error.code`, never from `error.message`. Server messages stay English and developer-facing, so `CREDIT_LIMIT_EXCEEDED` can read "Plafond de crédit dépassé" or "Credit limit exceeded" without the backend knowing either string.

### Auth & identity

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/register` | creates company + user as `pending`, returns request id + a **pending-scoped** token |
| `POST` | `/auth/login` | → `{ access_token, refresh_token, user, company }`; rate-limited |
| `POST` | `/auth/refresh` | rotating refresh token |
| `POST` | `/auth/logout` | revokes refresh token |
| `GET` | `/me` | user + company + credit summary in one call — what every screen needs at boot |

### Onboarding

| Method | Path | Notes |
|---|---|---|
| `POST` | `/account-requests/:id/documents/presign` | → R2 presigned `PUT`; **the phone uploads straight to R2, the API never proxies file bytes** |
| `POST` | `/account-requests/:id/documents` | confirm upload (kind, key, size, mime) |
| `GET` | `/account-requests/mine` | current status — poll fallback for `Wait.js` |
| `GET` | `/account-requests/mine/stream` | **SSE**: the moment the agent clicks approve, `Wait.js` advances |

The SSE stream is worth the ~30 lines it costs: your demo becomes *"watch the phone while I approve this on the laptop"*, which lands far better than *"now we wait ten seconds for the next poll."*

### Catalog

| Method | Path | Notes |
|---|---|---|
| `GET` | `/catalog` | whole tree: categories + brands + products, **both languages in one payload**. One request = the entire browse experience. ETag, 60 s cache |
| `GET` | `/categories` | tree only |
| `GET` | `/categories/:slug/brands` | includes `product_count` → drives `productnf.js` honestly |
| `GET` | `/products` | `?category=&brand=&size=&q=&in_stock=&cursor=&limit=` keyset paginated |
| `GET` | `/products/:id` | **live** stock, uncached |

### Orders, credit, payments

| Method | Path | Notes |
|---|---|---|
| `POST` | `/orders` | `Idempotency-Key` header required; body `{ items:[{product_id, quantity}], payment_type, payment_method? }` |
| `GET` | `/orders` | keyset paginated, items included, server-computed `days_left` + `urgency` |
| `GET` | `/orders/:id` | |
| `POST` | `/orders/:id/payments` | the `orders.js` "Pay" button |
| `POST` | `/orders/:id/cancel` | restores stock, frees credit |
| `GET` | `/credit` | `{ limit, outstanding, available, next_due_date, overdue_count }` |

Note the order body carries **no prices**. The client sends product ids and quantities; the server prices the order. Trusting a client-sent total is how a 13,500 DA tire gets bought for 1 DA.

### Admin (role `agent` / `admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/account-requests?status=pending` | the queue |
| `GET` | `/admin/account-requests/:id` | with **short-lived signed URLs** for the 5 documents |
| `POST` | `/admin/account-requests/:id/approve` | optional `credit_limit`, `credit_term_days` override |
| `POST` | `/admin/account-requests/:id/deny` | `reason` required |
| `PATCH` | `/admin/products/:id` | price / status |
| `PATCH` | `/admin/products/:id/stock` | absolute set or delta, audited |
| `GET` | `/admin/orders` | filter by company / status / overdue |
| `PATCH` | `/admin/orders/:id/status` | preparing → shipped → delivered |
| `POST` | `/admin/payments/:id/confirm` | releases credit |
| `PATCH` | `/admin/settings` | credit ceiling / term / VAT rate — **role `admin` only**, audited |

OpenAPI is generated from the route schemas by `@fastify/swagger` — zero extra effort, and a browsable `/docs` is a genuinely good thing to put on screen during a defense.

---

## 5. Making it fast — and correct

"Fast" for this app is not throughput. It is **two numbers**: how long after login until the catalog is on screen, and how long the "Confirm Purchase" button spins. Everything below targets those two.

### 5.1 One request for the whole catalog, cached, with ETags

24 products, 3 brands, 5 categories — the entire catalog is a few kilobytes. Paginating it would be theatre. Instead `GET /catalog` returns the whole tree, and:

- it is built once and held in an in-process cache with a 60 s TTL → **zero DB hits on the hot path**,
- the payload is hashed into an **ETag**; the app sends `If-None-Match` and normally receives `304 Not Modified` with an empty body,
- `Cache-Control: private, max-age=60, stale-while-revalidate=300`,
- it carries **both** languages, so one cache entry serves every user and switching language refetches nothing (§4.1).

Result: after the first login, browsing Tires → Light → Continental → a product **does not touch the network at all**. No amount of query tuning could match that. The cache is explicitly invalidated when an admin changes a price or a product.

### 5.2 Why `product_stock` is a separate table

Stock is the fastest-changing column in the catalog and the only one that changes on every single order. Keeping it inside `products` would invalidate the catalog ETag on every purchase — destroying §5.1 — and would churn `products` row versions (Postgres MVCC writes a new row version per `UPDATE`, bloating the table and every one of its indexes).

Split, the layering becomes clean and each layer is justified:

| Data | Volatility | Strategy |
|---|---|---|
| names, prices, images | monthly | cached 60 s + ETag |
| in-stock boolean | per order | included in catalog, 60 s staleness tolerated |
| exact quantity | per order | `GET /products/:id`, live |
| **authoritative stock** | — | re-checked **atomically inside the order transaction** |

A card showing "In Stock" that is 40 seconds stale is harmless. The transaction is the only place that must be exactly right — and it is.

### 5.3 Indexes

```sql
create index on products (category_id, brand_id) where status = 'active';
create index on products (brand_id);
create index on orders   (company_id, created_at desc);
create index on orders   (company_id, payment_type, payment_state);   -- credit outstanding
create index on orders   (payment_state, due_date) where payment_type = 'credit';
create index on order_items (order_id);
create index on account_requests (status, created_at);
create index on documents (account_request_id);
create unique index on users (lower(username));
```

Two of those are **partial indexes** (`where status = 'active'`, `where payment_type = 'credit'`): they index only the rows queries actually touch, so they stay small and stay resident in memory. The column order of `(company_id, created_at desc)` matches the orders screen exactly — equality column first, sort column second — so Postgres walks the index in order with **no sort step at all**.

### 5.4 Keyset pagination, not `OFFSET`

```sql
select … from orders
 where company_id = $1 and (created_at, id) < ($2, $3)
 order by created_at desc, id desc
 limit 20;
```

`OFFSET 10000` makes Postgres read and discard 10,000 rows. Keyset seeks straight to the position through the index, so page 500 costs exactly what page 1 costs. It is also the only pagination that cannot skip or duplicate rows when new orders arrive mid-scroll — the normal case on a mobile list.

### 5.5 Idempotent order creation

Mobile networks drop responses. A user taps "Confirm Purchase", the response is lost, they tap again — and are billed twice. So `POST /orders` requires an `Idempotency-Key` header (a UUID the app generates once per checkout attempt and reuses across retries). The first call stores key → response; a replay returns the stored response without creating a second order.

This is the kind of detail that separates a project that works *on the demo wifi* from one that works.

### 5.6 The order transaction — the heart of the system

Two classic races have to die here: two orders passing the credit check simultaneously, and two orders buying the last tire simultaneously.

```sql
BEGIN;  -- READ COMMITTED is sufficient, given the explicit lock below

-- 1. Serialise concurrent order placement for THIS company only.
SELECT credit_limit, credit_term_days
  FROM companies WHERE id = $company FOR UPDATE;

-- 2. Decrement stock atomically. A conditional UPDATE, not SELECT-then-UPDATE:
--    the check and the write are one statement, so no window exists between them.
UPDATE product_stock
   SET quantity = quantity - $qty, updated_at = now()
 WHERE product_id = $pid AND quantity >= $qty;
--  0 rows affected  →  INSUFFICIENT_STOCK  →  ROLLBACK

-- 3. Price from the DATABASE, never from the request body. Prices are TTC,
--    so tax is EXTRACTED rather than added -- the customer pays exactly the
--    figure the app showed, and the invoice still carries a correct HT/TVA split.
--    total    = Σ(unit_price × qty)      -- TTC
--    subtotal = total / (1 + vat_rate)   -- HT
--    vat      = total - subtotal         -- TVA 19%

-- 4. Credit gate (credit orders only):
SELECT coalesce(sum(total - amount_paid), 0) AS outstanding
  FROM orders
 WHERE company_id = $company
   AND payment_type = 'credit' AND payment_state <> 'paid';
--  outstanding + total > credit_limit  →  CREDIT_LIMIT_EXCEEDED  →  ROLLBACK

-- 5. INSERT order (+ items); due_date = current_date + credit_term_days
COMMIT;
```

`FOR UPDATE` on the company row is the narrowest lock that makes the credit check safe: it blocks only that one company's concurrent orders, never the whole table. Without it, two orders of 700,000 DA each read the same 500,000 DA outstanding, both conclude they fit under 1,250,000, and both commit — putting the company 150,000 DA over its ceiling, with no bug visible anywhere in the code.

`order_no` comes from a Postgres sequence (`'CMD-2026-' || lpad(nextval(…)::text, 6, '0')`), never from `COUNT(*) + 1`, which collides under concurrency.

### 5.7 Outstanding credit is computed, not stored

A `credit_used` column on `companies` would be one fewer query — and would silently drift the first time a payment is confirmed through a code path that forgets to update it. At this scale, the `SUM` in step 4 over its partial index costs microseconds. **Do not denormalise before measuring.** If profiling ever shows it matters, the counter can be added behind the same service method without touching a single caller.

The same logic applies to overdue status: nothing is stored and no cron job runs. An order is overdue iff `due_date < current_date AND payment_state <> 'paid'`, evaluated on read. The server returns `days_left` and `urgency: "ok" | "soon" | "overdue"`, so `orders.js` can delete its `calculateDaysLeft` and `getDaysLeftColor` helpers — business rules belong on one side of the wire, not duplicated on both.

### 5.8 Connection pooling on Neon — the cloud gotcha

Neon is serverless Postgres and will exhaust direct connections quickly. Prisma must use **two** URLs:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // …-pooler.neon.tech  (PgBouncer) — the app
  directUrl = env("DIRECT_URL")     // direct endpoint                 — migrations only
}
```

with `?pgbouncer=true&connection_limit=5` on the pooled URL. Skipping this is the most common way a Neon + Prisma deployment falls over under its first real load.

### 5.9 The rest of the fast path

- `@fastify/compress` — brotli/gzip. JSON over a 3G connection is bandwidth-bound, not CPU-bound.
- Product images from R2's CDN with `Cache-Control: public, max-age=31536000, immutable` (filenames are content-stable), so each image downloads exactly once per device, ever.
- Stateless JWT access tokens (15 min) → **no database round trip to authenticate a request**. Refresh tokens (30 d, rotating, stored hashed) are the only auth DB hit.
- Prisma `include` must carry `relationLoadStrategy: 'join'`. Its default issues **one SELECT per relation**, which measurement proved expensive — see §5.11.
- `@fastify/rate-limit` on `/auth/*`.

### 5.10 Targets

Two columns, because they are two different distances. "Dev" is this laptop in
Algeria talking to Neon in Frankfurt, where one database round trip costs ~238 ms.
"Prod" is the API deployed to Fly.io `fra`, in the same region as the database,
where a round trip is single-digit milliseconds. §5.11 has the measurements.

| Endpoint | dev (cross-continent) | prod target (co-located) |
|---|---|---|
| `GET /catalog` (cache hit) | **5 ms measured** | < 10 ms |
| `GET /catalog` (cold) | ~250 ms | < 60 ms |
| `GET /products/:id` | **250 ms measured** | < 30 ms |
| `GET /orders` (20 rows) | ~300 ms | < 80 ms |
| `POST /orders` | ~300 ms (one round trip by design) | < 100 ms |
| `POST /auth/login` | argon2id dominates | < 250 ms |

Measured with `autocannon`. The numbers go in your report — with the distance
explained, because a reviewer who sees 250 ms without context will think the
design is slow when the cable is.

### 5.11 What measuring actually changed

Phase 0 was benchmarked rather than assumed, and it overturned one claim in this
document. Recording it because the correction is more instructive than the
original guess.

**The cached path is as fast as hoped.** `GET /catalog`, 50 connections, 10 s:

```
p50 5 ms   p90 6 ms   p97.5 9 ms   p99 11 ms      ~8,000 req/sec
9,622 bytes raw  ->  2,263 bytes gzipped
```

**The uncached path was not.** `GET /products/:id` first measured **p50 1,004 ms**
at only 9 req/sec. Query logging found the cause, and it was not the database:

```
product detail, include{stock, brand, category}  =  7 round trips
  BEGIN  /  DEALLOCATE ALL  /  SELECT products  /  SELECT product_stock
  SELECT brands  /  SELECT categories  /  COMMIT                   518 ms
```

Prisma's default `relationLoadStrategy` runs **one SELECT per relation**, wrapped
in a transaction for a consistent snapshot. The claim in §5.9 that `include`
costs "2–3 queries, never N+1" was wrong — it is 1 + one per relation.
Switching to `relationLoadStrategy: 'join'` (LATERAL joins, a single statement)
measured:

| | round trips | one request | under 10 conns |
|---|---|---|---|
| default (`query`) | 7 | 547 ms | p50 1,004 ms, 9 req/s |
| `join` | 4 | 250 ms | **p50 470 ms, 21 req/s** |

**Then the real lesson.** With one round trip costing ~238 ms, round trips — not
query plans — are the only thing that matters at this distance:

```
1 round trip                        238 ms
5 statements inside a transaction   624 ms
the same work as 1 statement        242 ms
```

That last line is the design constraint for §5.6. The order transaction as
written — BEGIN, `SELECT FOR UPDATE`, a stock `UPDATE` per item, the credit
`SUM`, two `INSERT`s, COMMIT — is 8–10 statements, so **as a sequence of Prisma
calls it would take well over a second**. Two consequences, and both are being
adopted:

1. **Order placement ships as one `place_order()` PL/pgSQL function.** The lock,
   the conditional stock decrement, the credit check and the inserts all execute
   inside Postgres and return the finished order, so "Confirm Purchase" costs one
   round trip instead of ten. This is not only a latency fix: moving the whole
   money path into a single server-side atomic unit removes any chance of the
   transaction being left half-applied by a dropped connection mid-sequence.
2. **The API deploys to the same region as the database** (Fly.io `fra` + Neon
   Frankfurt). This is the larger win and it is free: co-located, a round trip
   falls from ~238 ms to single digits, and even a chatty endpoint is fast. The
   238 ms figure is an artefact of developing from Algeria against Frankfurt —
   it is *not* what users will see, and that distinction belongs in the report.

The caching in §5.1 also stops being a nicety: 5 ms cached versus 250 ms
uncached is a **50×** difference locally, which is why the catalog ships as one
cached payload rather than as per-screen requests.

---

## 6. Security

This app handles **ID cards, bank statements and a credit facility**. That raises the bar above a normal student project, and two things matter most:

1. **KYC documents are private, always.** The R2 bucket is not public; the admin panel receives 5-minute presigned URLs generated per view. A publicly readable bucket containing customers' ID cards and bank statements would be the single worst defect this project could ship.
2. **Pending accounts are scoped.** A user whose company is `pending` or `denied` gets a token that can reach exactly one endpoint — their own request status. Not the catalog, not orders. That check lives in one auth hook, not scattered across routes.

Also: argon2id password hashing (memory-hard, resists GPU cracking in a way bcrypt does not); JSON Schema validation on every route body/params/query, so unvalidated input cannot reach a service; `@fastify/helmet`; CORS restricted to the admin panel origin and the Expo app; every secret read from the environment and validated at boot, nothing in the repo; parameterised queries throughout (Prisma), making SQL injection structurally impossible.

---

## 7. Deployment (free tier)

| Piece | Service | Why |
|---|---|---|
| Postgres | **Neon** free | serverless, generous free tier, DB *branching* → a throwaway database per feature |
| API | **Fly.io**, region `fra` | `min_machines_running = 1` keeps one instance warm — and `fra` puts it **in the same region as the database**, which §5.11 showed is the single biggest latency decision in the project |
| Admin panel | **Cloudflare Pages** (or Vercel) | static, free, global |
| Files | **Cloudflare R2** free, 10 GB | S3-compatible, **no egress fees**, presigned uploads |

**Deploy the API in the database's region.** Not a micro-optimisation: §5.11
measured one database round trip at ~238 ms from a laptop in Algeria to Neon in
Frankfurt. Co-located in `fra`, that same round trip is single-digit
milliseconds. An API in Virginia talking to a database in Frankfurt would make
every endpoint feel broken no matter how good the queries are, so the region
field on the Fly.io deploy matters more than any index in this document.

**One honest warning about the "deploy to cloud" choice.** Render's free tier spins the service down after 15 minutes of inactivity, and its cold start is roughly 50 seconds. If your jury opens the app after you have been talking for twenty minutes, it hangs — during the one demo that counts. Three mitigations, and I suggest all three:

1. prefer **Fly.io** with one always-on machine over Render's free tier,
2. a 10-minute keep-warm ping (cron-job.org, free) against `/health`,
3. keep `docker-compose.yml` in the repo so the entire stack runs offline on your laptop as a fallback — **and rehearse that path.** Campus wifi fails; your defense should not depend on it.

Also: `/health` (liveness) and `/ready` (DB reachable) endpoints, structured JSON logging via `pino` (built into Fastify), and `prisma migrate deploy` on release — never `db push` against production.

---

## 8. What the frontend gains

Beyond real data, the backend lets you **delete most of the duplicated screen code**:

- The 8 brand-product screens (`Light-T/Tires-brands/continental.js`, `Heavy-T/Tires-Brands/semperit.js`, …) are byte-for-byte identical except for their `const Tires` array and a title. They collapse into **one** `BrandProducts` screen taking `{ categorySlug, brandSlug }` route params. **8 files → 1.**
- The 3 brand-list screens (`Light-Tires-car.js`, `Heavy-T-Brands.js`, `Agricultural-T-Brands.js`) collapse the same way into one `BrandList`. **3 → 1.**
- `Card.js`'s 9-branch `switch` on brand name (`case 'IrisA': navigate('prodnf')`) disappears entirely. Navigation becomes `navigate('BrandProducts', { categorySlug, brandSlug })`, and the empty state is reached because `product_count === 0` — not because it was hardcoded for Iris.
- `Components/LubeCard.js`, `Procucts-Card.js` and `ProductCard.js` are three copies of the same card. One survives.
- `orders.js` loses its date arithmetic; `ProductDetail.js` loses the hardcoded `1250000`.

Net: roughly **13 files reduced to 4**, with every product, price and limit coming from the database. That is a strong thing to show in a defense — *"the backend did not just add data, it removed two thirds of my screen code."*

**Bilingual on the client.** `i18next` + `react-i18next` with two bundles (`fr.json`, `en.json`), seeded from `expo-localization` so the app opens in the phone's own language, plus a manual FR/EN toggle in the drawer persisted to `AsyncStorage`. Every string currently hardcoded in a screen — `"Confirm Purchase"`, `"Jours restants"`, `"No Tires Available"`, `"Documents Needed"` and the 5-document list in `Register.js` — moves into those bundles, which is the one unavoidable sweep across all screens. The admin panel reuses the same bundles, French-first, since Naftal's agents are francophone. Neither language is RTL, so no layout work is needed; the same structure takes an `ar.json` later, which *would* need RTL.

Client-side plan for that phase: `@tanstack/react-query` (caching, retries, stale-while-revalidate, loading and error states for free), `expo-secure-store` for tokens — they are credentials, not `AsyncStorage` material — `expo-image` for disk-cached images, and one `src/api/client.js` wrapper handling base URL, auth header, 401 → refresh → retry, and timeouts.

---

## 9. Seed data — your real values

Everything already in the code gets seeded, so the app looks identical on day one and nothing is invented:

| Category | Brand | Products | Price range (DA) |
|---|---|---|---|
| Light tires | Continental | ULTRACONTACT, ALL-S-C2 *(out of stock)*, WINTER-C | 13 500 – 17 000 |
| Light tires | Iris | AURES, ECORIS, STORMY | 8 700 – 11 000 |
| Light tires | Semperit | SPEED-LIFE2, COMFORT-L2, MASTER-GRIP2 | 7 800 – 9 200 |
| Heavy tires | Continental | HDL-3-EP, HAU-5 *(out of stock)*, HCS | 13 500 – 17 000 |
| Heavy tires | Iris | LANE-LT | 9 200 |
| Heavy tires | Semperit | RUNNER-T3, RUNNER-F2, RUNNER-D2 | 7 800 – 9 200 |
| Agricultural | Continental | TRACTOR85, COMBINEMASTER *(out of stock)*, MPT81 | 13 500 – 17 000 |
| Agricultural | Semperit | WORKER-F2, WORKER-T2 | 7 800 – 8 400 |
| Agricultural | Iris | *(none — this is what drives the empty state)* | — |
| Lubricants | Naftal / Total | Naftalia Super, Total Quartz, Total Rubia | 7 800 |

**24 products, 21 images already sitting in `assets/`.** `available: false` becomes `quantity: 0`; the in-stock products get realistic non-zero quantities so stock limits are actually demonstrable. Two unused images are already in the repo (`assets/Iris/sefar.png`, `assets/Lubricant/Mobil-delvac.jpg`) if you want two more rows.

Also seeded: one admin user; one approved demo company with orders in three states (paid, credit-due-soon, credit-overdue) so the Orders screen shows green / orange / red immediately; and one pending account request, so the approval demo is one click away.

---

## 10. Decisions — resolved

All five open questions are answered. Recorded here so the reasoning survives into your report.

**1. Credit ceiling: 1,250,000 DA, fixed by Naftal, measured against the outstanding balance.**
The figure is policy, not a per-customer negotiation, so it lives in `app_settings` and only role `admin` can change it — the approval form has no credit field for an agent to fill in (§3.1). What *did* change from the current code is the meaning: 1,250,000 DA is the most a company may owe **at any one moment**, not the cap on a single order. Today's per-order check would let a company place ten 1,200,000 DA orders and owe twelve million. The app now also shows remaining credit *before* ordering, which the fixed ceiling makes possible — the number is knowable in advance because it never varies.

**2. Bilingual, French and English.**
Both languages ship together rather than the API picking one per request, because `/catalog` is ETag-cached and a per-language response would halve the cache hit rate while making the FR/EN toggle refetch everything. Categories carry `name_en` + `name_fr`; everything else is an enum key the app labels; errors are localised from `error.code`, never from the server's message. Brands and tire models are proper nouns and stay untranslated. Mechanics in §4.1, client setup in §8.

**3. Credit term: 30 days.**
*What this means:* when a company buys on credit, this is how many days they have to pay before the order is late. It is the number that produces `deadline` in your `orders.js` mock — the "Jours restants" countdown, and the green → orange → red colouring (green normally, orange at 5 days or fewer, red once overdue). An order placed 7 October 2026 on a 30-day term is due 6 November 2026.

*Why 30:* it is the default commercial term in B2B almost everywhere, and it matches what your own mock data implies — `CMD001` carries a `2025-07-01` deadline on a file last edited in late May 2025, so roughly a month. It sits in `app_settings` beside the ceiling, so if Naftal's real term turns out to be 45 or 60 days it is one value to change, with no migration and no code edit.

**4. Prices are TTC — tax included.**
*What this means:* in Algeria a price is quoted one of two ways. **HT** (*hors taxes*) is the price before the 19% TVA, which then gets added at the end. **TTC** (*toutes taxes comprises*) is the final price with the tax already inside it. For one ULTRACONTACT at 13,500 DA the difference is not small:

| | price shown | VAT | customer pays |
|---|---|---|---|
| if 13,500 is **HT** | 13 500 | +2 565 | **16 065 DA** |
| if 13,500 is **TTC** | 13 500 | *(2 155 inside)* | **13 500 DA** |

*Why TTC:* your `ProductDetail.js` already shows `Total: DA 27000` for two tires. If the prices were HT, confirming that order would charge 32,130 DA — a number the customer never saw, appearing only after they commit. Treating them as TTC means the figure on the card is the figure they pay, and the existing 24 prices stay literally true.

The tax is therefore **extracted, not added**: `subtotal_HT = total / 1.19` and `vat = total − subtotal_HT`, both stored on the order (§3.3). So a Naftal invoice still carries a correct HT / TVA / TTC breakdown — legally required — while the app never surprises anyone with a bigger number at checkout. A `price_display_mode` setting can flip the whole app to HT display later without touching the stored data.

**5. No version control until the work is finished — understood.**
Nothing gets committed, nothing gets pushed, nothing gets published anywhere. For the record, `git init` is purely local and uploads nothing, so it stays available whenever you want it; raising it once is enough.

Because that removes the usual safety net, one substitute during the Phase 2 refactor: the 13 screens being collapsed into 4 are **copied, never edited in place** — new files land alongside the originals, the app is switched over and confirmed working, and only then do you decide what to delete. Your current frontend keeps running untouched the whole time.

---

## 11. Build order

| Phase | Deliverable | Demo-able? |
|---|---|---|
| 0 ✅ | backend scaffold, env config, Prisma schema + migrations, seed the 24 real products | `/docs` opens, `/catalog` returns your data |
| 1 ✅ | Auth + registration + document upload + admin approval queue + SSE | **register on the phone → approve on the laptop → the phone advances** |
| 2 ✅ | Catalog endpoints + cache + wire the mobile screens; collapse 13 screens into 4 | the app runs entirely on live data |
| 3 ✅ | Orders + credit + payments; wire `ProductDetail` and `orders.js` | buy on credit, hit the ceiling, pay, watch credit free up |
| 4 | Expo push on approval / order status / due-date reminders | the phone buzzes when the agent approves |
| 5 | Deploy (Neon + Fly + Pages + R2), `autocannon` benchmarks, rehearsed offline fallback | real URLs, plus the numbers for your report |

Phases 0–3 are the project. Phases 4 and 5 are what make it look finished.

### Phase 4: notifications, and a hole phase 3 left

**The agent console could not confirm a payment.** Phase 3 made "declare, then an
agent confirms" a core part of the model — a customer's credit stays consumed
until someone verifies the cheque — and then shipped the API for it with no UI.
In practice that meant the workflow was reachable only by curl. The console now
has an Orders section with three queues (payments to verify, overdue, all),
expandable order lines, and confirm/reject on each declared payment. Closing
this mattered more than starting phase 4, so it went first.

**Push is additive to SSE, not a replacement.** The SSE stream (§4) only reaches
a phone with the Wait screen open, and most applicants will have closed the app
long before an agent reaches their file. Both fire on a decision.

**Device tokens record their own language.** API responses stay
language-agnostic (§4.1) because the client can choose at render time — but a
notification has exactly one language by the time it reaches a lock screen, so
the choice has to be made server-side. Each device stores its preference, and
every notification is persisted in both languages so the in-app history can
still switch freely.

**The due-date sweep is the one thing that cannot be computed on read.**
Everything else about deadlines is derived when someone asks (§5.7); "tell me
three days before" has no reader to derive it for. It runs on a plain interval
and is idempotent per order, per state, per day, so a restart cannot
double-notify. On more than one instance it would need a real scheduler or a
Postgres advisory lock so only one node sweeps — the same single-process caveat
as the SSE bus.

**What is verified, and what is not.** Delivery to a real handset cannot be
tested from here: it needs a physical device and a development build, since push
does not work in Expo Go on Android (SDK 53+) or on web. Everything up to the
handset is covered, including a direct probe confirming Expo accepts the exact
payload shape we send — it returns HTTP 200 and rejects only the fake token,
with the `DeviceNotRegistered` error the pruning path already handles. Every
failure mode on the client returns a reason (`web-unsupported`, `simulator`,
`permission-denied`, `no-eas-project-id`) rather than throwing, so the app runs
identically without push and you can see why it did not register.

### Phase 3: the money path, measured

`place_order()` shipped as written in §5.6 and the numbers hold:

| | |
|---|---|
| one order, end to end | **255 ms** (one round trip) |
| the same work as separate Prisma calls | ~1.5 s (8–10 round trips × 238 ms) |

**The lock was tested, not assumed.** `tests/credit-race.mjs` gives a company a
50,000 DA ceiling and fires five simultaneous 27,000 DA credit orders. Exactly
one commits and the company lands at 27,000 DA owed. Without `FOR UPDATE` on the
company row, several would read the same outstanding balance of 0, each conclude
it fits, and all commit — a defect that produces no error anywhere and is
invisible in single-user testing.

**The rate limiter caught me out, correctly.** Re-running the suites started
failing at `register` with `429`, which looked like a regression and was not: the
production limit of 5 registrations per 10 minutes was doing its job against a
suite that creates several companies per run. The limits are now env-configurable
with the production values as defaults, raised only in the development `.env`.
Worth recording because the failure mode — a cascade of 401s downstream of one
429 — reads exactly like a broken auth system.

**Two test bugs, no product bugs.** The orders suite first reported 2 failures.
One assertion was `a === b ?? true`, which parses as `(a === b) ?? true` and is
therefore always falsy; the other ordered 99,999 units, which the route schema's
own `maximum: 9999` rejected before `place_order()` ever saw it. Both layers were
behaving correctly. The suite now tests each rejection at the layer that owns it.

### Closing the Register / Wait gap

Phase 2 left the app entering through the old fake `Register.js` and `Wait.js`,
which meant the SSE approval built in phase 1 was unreachable from the app
itself. Both are now wired, and doing so surfaced one real backend bug.

**`reply.raw.writeHead()` bypasses Fastify's `onSend` hooks**, which is where
`@fastify/cors` adds `Access-Control-Allow-Origin`. The SSE route therefore sent
no CORS header at all, and the browser blocked the stream outright. The client
fell back to polling, so nothing *looked* broken — the screen still advanced,
just up to 5 seconds late. The stream now sets those headers explicitly, against
the same `CORS_ORIGINS` allowlist. Measured end to end, agent's click to the
phone updating:

| | |
|---|---|
| polling fallback (CORS broken) | up to 5,000 ms |
| SSE (fixed) | **575 ms**, including the agent's own round trip |

That bug is a good argument for the fallback existing at all: the feature
degraded instead of failing, which is why it took measurement rather than an
error report to find.

**The old `Wait.js` never asked anyone anything.** It ran a six-step
`setTimeout` sequence and branched on `route.params.isApproved`, which its only
caller hardcoded to `true` — so every applicant was told they were approved. It
now subscribes to the real decision and shows the denial reason when there is
one. It also lists any missing documents while waiting, since an agent cannot
approve an incomplete file.

**The old `Register.js` cleanup was broken.** Its `useEffect` returned
`[timer1, timer2, timer3, timer4].forEach(clearTimeout)`, but `timer2`–`timer4`
were `const` declarations inside nested callbacks, so the outer names stayed
`undefined` and only the first timer was ever cleared. The rest fired after
unmount. The replacement collects them in one array.

### What phase 2 actually removed

The 11 duplicated screens collapsed as predicted, into `BrandList` and
`BrandProducts`. Three things the written plan did not anticipate:

**`Card.js`'s nine-branch `switch` is gone**, and with it the line
`case 'IrisA': navigate('prodnf')`. The empty state is now reached because the
API reports `productCount: 0` for Iris in agricultural tires — verified on
screen. `productnf.js` became a shared `EmptyProducts` component used by any
brand with no stock in a category.

**Splitting `model` from `size` fixed a real rendering bug**, not just a
modelling preference. `MPT81` has no size, so the old `name.split(' ')` put the
model on one line and an empty string on the other; `HDL-3-EP 11 R 22.5 144/142L`
pushed its load index into the size line. Separate columns render both
correctly.

**Logging out never cleared anything.** The old `NaftalBar.js` called
`navigation.replace('LoginScreen')` and nothing else — harmless when there was no
session, a real defect once there was one, since the new `Bootstrap` screen would
find the stored session and log the user straight back in. The replacement
revokes the refresh token server-side, clears SecureStore and drops the React
Query cache.

**One backend change came out of running the app:** `@fastify/helmet` defaults
`Cross-Origin-Resource-Policy` to `same-origin`, which blocked every product
image with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. This is a public API serving
public catalog images to clients on other origins, so the policy is now
`cross-origin`. Access control for anything sensitive is CORS plus the auth hook,
never CORP — KYC documents stay behind the staff-only streaming route either way.

### Where phase 1 departed from this document

**Document upload is multipart to the API, not a presigned PUT to R2** — for
now. §4 describes the phone uploading straight to R2 so file bytes never pass
through the API, which remains the right design and is what deploys. It needs
Cloudflare R2 credentials, which do not exist yet, so phase 1 ships a `local`
driver writing to `backend/.uploads/`. Both sit behind one interface in
`src/lib/storage.js`, selected by whether `R2_*` is set in `.env`, so adding the
credentials is the whole migration. The security property is preserved in both:
there is no public path to a document, only an authenticated staff-only route
that streams it.

**SSE is backed by an in-process EventEmitter**, which is correct for the single
Fly machine this deploys to and wrong the moment there are two — an approval
handled by instance A would not reach a phone connected to instance B. The
scale-out path is Postgres `LISTEN`/`NOTIFY`, needing no new infrastructure since
the database is already shared. The client polls as a fallback, so a missed
event delays the Wait screen rather than breaking it.
