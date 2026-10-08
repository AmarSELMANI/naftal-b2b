# Naftal B2B — API

Fastify + PostgreSQL (Neon) + Prisma. Design and rationale: [`../docs/BACKEND-DESIGN.md`](../docs/BACKEND-DESIGN.md).

## Setup

You have no local PostgreSQL and no Docker, so the database is Neon (free tier).

### 1. Create the database

1. Sign up at **https://neon.tech** (GitHub or Google login, no card).
2. **Create project** — name it `naftal`, region **AWS eu-central-1 (Frankfurt)**, the closest to Algeria.
3. On the project dashboard, find **Connection string**. You need it **twice**:
   - with the **Connection pooling** toggle **ON** → the host contains `-pooler` → this is `DATABASE_URL`
   - with the toggle **OFF** → no `-pooler` → this is `DIRECT_URL`

> Both strings contain the database password, so they belong in `.env` (which is
> gitignored) and never in a file like this one. This project's `.env` is already
> filled in.

Two URLs is not a mistake. Neon is serverless and runs out of direct connections quickly, so the app goes through PgBouncer while migrations need a direct connection. See §5.8 of the design doc.

### 2. Configure

```bash
cd backend
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — the pooled string. Append `&pgbouncer=true&connection_limit=5` if it isn't already there.
- `DIRECT_URL` — the direct string.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — two **different** random strings:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The process refuses to boot on a missing or too-short secret rather than running insecurely.

### 3. Create the tables and load your data

```bash
npm run migrate -- --name init    # creates the 15 tables
npm run seed                      # your 24 real products, prices, stock
```

### 4. Run

```bash
npm run dev
```

> Port **3100**, not 3000: AdGuard Home already listens on 3000 on this machine,
> and the API fails to bind with `EACCES` if you change it back. `PORT` lives in
> `.env`, and `PUBLIC_ASSET_BASE_URL` must use the same port or images 404.

- API docs (browsable, generated from the route schemas): http://localhost:3100/docs
- Catalog: http://localhost:3100/v1/catalog
- Liveness / readiness: http://localhost:3100/v1/health · `/v1/ready`

## Testing the catalog cache

The catalog is cached in-process for 60s and served under an ETag (§5.1):

```bash
# first call: X-Cache: MISS
curl -i http://localhost:3100/v1/catalog | head -20

# second call: X-Cache: HIT
# then replay the ETag it gave you — expect 304 with an empty body
curl -i -H 'If-None-Match: "<etag from above>"' http://localhost:3100/v1/catalog
```

## Connecting the phone

Expo on a physical device cannot reach `localhost` — that resolves to the phone
itself. Use your laptop's LAN address:

```bash
ipconfig        # find the IPv4 address of your Wi-Fi adapter, e.g. 192.168.1.14
```

Then the app's API base URL becomes `http://192.168.1.14:3100/v1`, and
`PUBLIC_ASSET_BASE_URL` in `.env` must use the same host, or images will not
load on the device. Re-run `npm run seed` after changing it — the image URLs are
stored in the rows.

## Layout

```
src/
  config/env.js       env validated at boot; a bad secret stops the process
  lib/
    errors.js         one error shape + the codes the app branches on
    money.js          TTC prices, VAT extracted not added (§10.4)
    dates.js          credit deadlines, daysLeft + urgency (§5.7)
  plugins/prisma.js   one client per process, closed on shutdown
  modules/
    health/           liveness vs readiness, kept separate on purpose
    catalog/          cached + ETagged read path
prisma/
  schema.prisma       15 tables — read §3 of the design doc before changing one
  seed.js             your real catalog, nothing invented
```

## Scripts

| Command                  | Does                                            |
| ------------------------ | ----------------------------------------------- |
| `npm run dev`            | watch mode                                      |
| `npm run migrate`        | create + apply a migration (development)        |
| `npm run migrate:deploy` | apply migrations (production — never `db push`) |
| `npm run seed`           | load/refresh the catalog, idempotent            |
| `npm run studio`         | browse the database in a GUI                    |
| `npm run reset`          | **drops everything** and re-seeds               |

## A note on local speed

Developing from Algeria against Neon in Frankfurt, **one database round trip
costs ~238 ms**. So locally:

| | |
|---|---|
| `GET /catalog` (cached) | **5 ms**, ~8,000 req/sec |
| `GET /products/:id` (live DB) | **250 ms** |

That gap is the network, not the code, and it is why the catalog ships as one
cached payload. Deployed to Fly.io in region `fra` — the same region as the
database — round trips drop to single-digit milliseconds. See §5.11 of the
design doc before quoting any of these numbers in your report.

Consequence worth knowing now: anything that needs several statements in one
transaction must not be written as several Prisma calls. Order placement
(phase 3) ships as a single `place_order()` function inside Postgres.

## Tests

```bash
npm run test:e2e      # 118 assertions against a running server
npm run test:race     # the concurrent credit-limit race
```

The suites sign in as `admin` to approve the companies they create, so
`ADMIN_PASSWORD` has to be in `backend/.env` first — the password the seed
printed. Quote it if it contains a `#`.

**Onboarding (47):** registration, the terms checkbox enforced server-side,
duplicate usernames, the onboarding scope gate, document upload (including an
`.exe` being rejected), the admin queue, document access control (401 anonymous
/ 403 customer / 200 staff), live SSE approval, scope upgrade after approval,
refresh-token rotation with reuse detection, double-decision refusal, the denial
path, and username enumeration resistance.

**Orders (53):** order placement and totals, VAT extraction summing exactly back
to TTC, order numbering, idempotent replay, stock enforcement at both the schema
and the function, the credit ceiling, rollback on refusal, declared-then-
confirmed payments, credit freeing only on confirmation, keyset pagination with
non-overlapping pages, cross-company isolation, and cancellation restoring stock.

**Notifications (17):** push-token validation, upsert on re-registration,
registration while still onboarding (the approval push has to reach a pending
applicant), the notification record written in both languages, unread counts,
and the due-date sweep being safe to run twice.

> What these do **not** cover: delivery to a real handset. That needs a physical
> device and a development build — push does not work in Expo Go on Android
> (SDK 53+) or on web. What is verified is everything up to the handset,
> including that Expo accepts the exact payload shape we send.

**The race test** fires 5 simultaneous credit orders at a company whose ceiling
fits only one, and asserts that exactly one commits. Without the `FOR UPDATE`
lock in `place_order()`, several would read the same outstanding balance and all
pass the check.

> If a suite suddenly fails at `register`, check for `429 RATE_LIMITED`: the
> production limits are 5 registrations per 10 minutes and 10 logins per 5
> minutes. `.env` raises them for development via `RATE_LIMIT_REGISTER_MAX` and
> `RATE_LIMIT_LOGIN_MAX`; leave them unset in production.

## Status

**Phase 4 complete** — push notifications on approval, denial, payment
confirmation and order status, plus a due-date reminder sweep. Also: the agent
console can now list orders and confirm declared payments, which phase 3 left
reachable only by curl.

**Phase 3 complete** — orders, the credit ceiling and payments. The whole money
path is one Postgres function, `place_order()`: company-row lock, atomic stock
decrement, server-side pricing, credit check and inserts, in a single round trip
(~255 ms measured, against ~1.5 s for the same work as separate Prisma calls).

**Phase 1 complete** — auth (argon2id + rotating JWTs), registration, document
upload, the admin approval queue, SSE live decisions, and credit policy
settings. The agent console lives in [`../admin-web`](../admin-web).

**Phase 0 complete** — schema (15 tables, migrated to Neon), seed (24 real
products), cached catalog read path, ops endpoints, generated API docs.

Phase 5 is in §11 of the design doc: deployment to Fly.io `fra` alongside the
database, which §5.11 shows is the single biggest latency decision in the
project.

The seed creates one `admin` user. There is no default password: leave
`SEED_ADMIN_PASSWORD` blank and the seed generates a random one and prints it
once, or set it yourself. Seeding with `NODE_ENV=production` and no
`SEED_ADMIN_PASSWORD` is refused. Re-running the seed never resets an existing
admin password.
