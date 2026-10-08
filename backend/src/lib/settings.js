// Naftal-wide policy, cached in process.
//
// The credit ceiling is read on every credit order. At ~238ms per database
// round trip (§5.11) fetching it each time would add a quarter of a second to
// every purchase, so it is cached and invalidated on write. There is exactly one
// writer — PATCH /admin/settings — so this cannot go stale behind our back.

const TTL_MS = 300_000; // 5 minutes; a policy change invalidates immediately

const DEFAULTS = {
  credit_limit: 1250000,
  credit_term_days: 30,
  vat_rate: 0.19,
  price_display_mode: 'TTC',
};

let cache = { values: null, loadedAt: 0 };

export function invalidateSettings() {
  cache = { values: null, loadedAt: 0 };
}

export async function getSettings(prisma) {
  if (cache.values && Date.now() - cache.loadedAt < TTL_MS) return cache.values;

  const rows = await prisma.appSetting.findMany();
  const values = { ...DEFAULTS };
  for (const r of rows) values[r.key] = r.value;

  cache = { values, loadedAt: Date.now() };
  return values;
}

/**
 * Effective credit terms for a company: its own override if set, else policy.
 * `companies.credit_limit` is NULL for every company today — the ceiling is
 * Naftal-wide — but the override exists for the day one client gets a different
 * one, without a migration. §3.1
 */
export async function creditTermsFor(prisma, company) {
  const s = await getSettings(prisma);
  return {
    creditLimit: company.creditLimit !== null ? Number(company.creditLimit) : Number(s.credit_limit),
    creditTermDays: company.creditTermDays ?? Number(s.credit_term_days),
  };
}
