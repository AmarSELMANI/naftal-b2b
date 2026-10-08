# Naftal B2B

A private ordering application for Naftal's business customers. Enterprises
apply for an account, a Naftal agent reviews their documents and approves them,
and they then order tires and lubricants — paying immediately, or on credit
against a company credit ceiling.

> An academic project, built as a final-year graduation work. Not affiliated
> with, endorsed by, or an official product of Naftal. Company names, logos and
> product images belong to their respective owners and are used here only to
> model a realistic scenario.

The project is three parts that share one database:

| | | |
|---|---|---|
| **`/`** | React Native (Expo) | the customer app, French and English |
| **`backend/`** | Fastify + PostgreSQL + Prisma | the API |
| **`admin-web/`** | React + Vite | the agent console |

---

## What it does

**Account opening.** A company submits its details and five documents — ID card,
proof of address, trade register, tax identification number, bank statement. An
agent reviews them in the console and approves or denies, with a reason. The
applicant's phone updates the moment the decision is made, over Server-Sent
Events, with polling underneath in case the stream is lost.

**Catalog.** Tires in three categories (light, heavy, agricultural) across three
brands, plus lubricants. Everything — categories, brands, prices, stock,
images — comes from the database.

**Ordering on credit.** Each company has a credit ceiling of 1,250,000 DA set by
Naftal. The ceiling is what the company may owe *at any one moment*, not a cap on
a single order. Credit orders get a 30-day deadline; the Orders screen counts
down and colours it green, orange or red.

**Payments.** A customer declares a payment — cheque, cash, card, transfer — and
a Naftal agent confirms receipt in the console. Only then does the credit free
up. This is how cheque and cash actually work in B2B, so the model matches the
business rather than pretending a payment gateway exists.

**Notifications.** Push on approval, denial, payment confirmation and order
status, plus reminders before a credit deadline falls due.

---

## Running it

You need Node 20+ and a PostgreSQL database. The project is developed against
[Neon](https://neon.tech)'s free tier, so no local database install is required.

### 1. Database

Create a Neon project, then copy the connection string **twice** — once with
connection pooling ON (the host contains `-pooler`) and once with it OFF. Two
URLs is not a mistake: the app connects through PgBouncer while migrations need
a direct connection.

### 2. API

```bash
cd backend
npm install
cp .env.example .env     # fill in both database URLs and two JWT secrets
npm run migrate          # creates the schema
npm run seed             # loads the catalog
npm run dev              # http://localhost:3100
```

Generate the JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The API refuses to start if a secret is missing or too short, rather than
running insecurely. Browsable API documentation is generated from the route
schemas and served at `/docs`.

### 3. Agent console

```bash
cd admin-web
npm install
npm run dev              # http://localhost:5173
```

Sign in as `admin`. There is no default password — the seed either uses
`SEED_ADMIN_PASSWORD` or generates a random one and prints it once.

### 4. Mobile app

```bash
npm install
npm start                # scan the QR code with Expo Go
```

The API base URL is derived from the Expo dev server's own host, so a physical
phone finds your machine without any address being hardcoded.

---

## Design notes

The full reasoning is in [`docs/BACKEND-DESIGN.md`](docs/BACKEND-DESIGN.md).
The decisions that shaped the most code:

**Order placement is a single PostgreSQL function.** `place_order()` takes the
company-row lock, decrements stock atomically, prices the order from the
database, checks the credit ceiling and writes the order and its lines — all
server-side. Measured from a development machine, one database round trip costs
~238 ms, so the same logic written as eight to ten separate queries would take
well over a second. As one function it is 255 ms. It is also the safer shape:
there is no half-applied state for a dropped connection to leave behind.

**The credit check holds under concurrency.** `SELECT … FOR UPDATE` on the
company row serialises that company's concurrent orders and nothing else.
Without it, two simultaneous orders read the same outstanding balance, both
conclude they fit under the ceiling, and both commit — a defect that raises no
error anywhere and is invisible in single-user testing. `tests/credit-race.mjs`
fires five simultaneous orders at a ceiling that fits one, and asserts that
exactly one commits.

**Outstanding credit is computed, never stored.** A counter column would be one
fewer query and would drift the first time a payment path forgot to update it.
At this scale the sum over its partial index costs microseconds.

**The catalog is one cached, ETagged request.** The whole tree — categories,
brands, products, both languages — is a few kilobytes, so it ships in a single
response held in an in-process cache behind an ETag. After the first load,
browsing from a category to a product touches no network at all: 5 ms cached
against 250 ms uncached.

**Prices are TTC, so VAT is extracted rather than added.** A tire listed at
13,500 DA costs 13,500 DA at checkout. The order still records a correct
HT / TVA / TTC split for the invoice, derived by subtraction so the three always
reconcile exactly.

**Money is `numeric`, never a float**, and order lines snapshot the price and
product name at the time of purchase — reopening a March order shows what was
actually paid, not today's price.

**KYC documents are never publicly readable.** Customers' ID cards and bank
statements leave storage only through an authenticated, role-checked route that
streams them. There is no public URL, which is why the console fetches them with
an auth header rather than pointing an `<img>` at them.

**Errors carry a machine-readable code.** Clients choose a French or English
message from `error.code` and never parse the English text, which keeps the API
language-agnostic and makes the in-app language toggle instant.

---

## Tests

```bash
cd backend
npm run test:e2e         # 118 assertions against a running server
npm run test:race        # the concurrent credit-limit race
```

The suites sign in as `admin` to approve the companies they create, so
`ADMIN_PASSWORD` has to be in `backend/.env` first — the password the seed
printed. Quote it if it contains a `#`.

The suites cover the whole onboarding path (including document access control
and refresh-token reuse detection), the order and credit path (idempotent
replay, stock enforcement, the ceiling, declared-then-confirmed payments, keyset
pagination, cross-company isolation), and notifications.

If a suite fails at registration with `429`, that is the rate limiter working:
5 registrations per 10 minutes and 10 logins per 5 minutes in production,
raised in development via `RATE_LIMIT_REGISTER_MAX` and `RATE_LIMIT_LOGIN_MAX`.

---

## Security

The app handles identity documents, bank statements and a credit facility, so a
few things are deliberate rather than incidental:

- **Passwords** are hashed with argon2id at OWASP's current parameters. Access
  tokens are short-lived JWTs; refresh tokens are single-use and rotate, and
  presenting one twice revokes every session for that user on the assumption it
  was stolen.
- **KYC documents have no public URL.** They are streamed only through an
  authenticated, role-checked route — verified by tests asserting 401 for
  anonymous, 403 for a customer, 200 for staff.
- **A pending applicant is scoped to one endpoint**, their own request status.
  Not the catalog, not orders. The check lives in one auth hook.
- **CORS fails closed in production.** With no `CORS_ORIGINS` set the API
  refuses to start rather than reflecting any origin back.
- **`X-Forwarded-For` is trusted only when `TRUST_PROXY=true`**, because
  trusting it without a proxy in front lets a client forge the header and get a
  fresh rate-limit bucket per request.
- **No default credentials.** The seed generates a random admin password and
  prints it once; seeding in production without `SEED_ADMIN_PASSWORD` is
  refused.
- **API docs are off in production** unless `ENABLE_DOCS=true`.
- Rate limiting on `/auth/*`, JSON Schema validation on every route, and
  parameterised queries throughout.

Known: `npm audit` reports one high-severity advisory in `deepmerge-ts`,
reached through the Prisma **CLI** (a devDependency, not the runtime client).
It is not on any request path and upstream has not published a fix.

---

## Deploying

The API ships as a container. `Dockerfile` and `fly.toml` are at the repository
root, not in `backend/`, because the API serves product images from `assets/`
and a build context of `backend/` cannot see that folder.

**Region `fra` is the one setting that must not change.** The database is in AWS
eu-central-1; a round trip measured from a development machine is ~238 ms.
Putting the app in the same city makes it single-digit, which is worth more than
every query optimisation here combined.

```bash
fly launch --no-deploy --copy-config      # creates the app, keeps fly.toml
```

Then the secrets. These never go in `fly.toml` — it is committed:

```bash
fly secrets set   DATABASE_URL="postgresql://…-pooler…?sslmode=require&pgbouncer=true&connection_limit=5"   DIRECT_URL="postgresql://…(no -pooler)…?sslmode=require"   JWT_ACCESS_SECRET="…"   JWT_REFRESH_SECRET="…"   SEED_ADMIN_PASSWORD="…"   CORS_ORIGINS="https://your-console.pages.dev"
```

If a password contains `:` or `/`, percent-encode it — they are structural
characters in a connection URL and Postgres will report a nonsense "invalid
port number" instead of an authentication error.

```bash
fly deploy
```

`prisma migrate deploy` runs as the release command, before the new machines
take traffic, so a failed migration aborts the release instead of leaving a
half-migrated database serving requests. Seed the catalog once afterwards with
`fly ssh console -C "npm run seed --prefix /app/backend"`.

**Documents.** With no `R2_*` set, uploads go to the container filesystem, which
Fly discards on every deploy — acceptable for a demo, data loss in use. Create a
**private** R2 bucket and add:

```bash
fly secrets set R2_ACCOUNT_ID="…" R2_ACCESS_KEY_ID="…"   R2_SECRET_ACCESS_KEY="…" R2_BUCKET_DOCUMENTS="naftal-documents"
```

The driver switches on their presence; no code changes. The bucket must stay
private — documents are streamed through the authenticated route, never linked.

**The console** is a static build: `npm run build` in `admin-web/`, deploy
`dist/` to Cloudflare Pages or Netlify, with `VITE_API_URL` set to
`https://naftal-api.fly.dev/v1`. Its origin must appear in `CORS_ORIGINS`.

**The app** reads `EXPO_PUBLIC_API_URL`, so a production build is
`EXPO_PUBLIC_API_URL=https://naftal-api.fly.dev/v1 eas build`.

---

## Status

Working: account opening with document review, the catalog, ordering on credit,
the credit ceiling, payments, the agent console, and notifications.

Not yet done:

- **Deployment has not been run.** The container and `fly.toml` are written and
  described above, but nothing is live: that needs a Fly.io account, and the
  numbers quoted here were measured against a local server talking to Neon.
- **R2 is implemented but unexercised.** The driver is written against the S3
  API and selected by `R2_*`; every test so far has run on the local driver,
  so treat the first upload to a real bucket as the thing to verify.
- **Push on a real handset** needs an EAS project id and a development build;
  push does not work in Expo Go on Android or on web. Everything up to the
  handset is implemented and tested.

---

## Layout

```
├── src/                    mobile app
│   ├── api/                client, session, catalog, orders, push
│   ├── screens/            one screen per route
│   ├── components/         shared UI
│   └── i18n/               fr / en
├── backend/
│   ├── src/
│   │   ├── modules/        auth, onboarding, catalog, orders, admin, notifications
│   │   ├── lib/            errors, money, dates, storage, tokens
│   │   └── plugins/        prisma, auth
│   ├── prisma/             schema, migrations, seed
│   └── tests/              end-to-end suites
├── admin-web/src/          agent console
└── docs/                   design document
```
