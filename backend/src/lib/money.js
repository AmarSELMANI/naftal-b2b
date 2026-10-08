// Money helpers.
//
// Prices in this system are TTC — the 19% TVA is already inside unit_price
// (§10.4), so VAT is EXTRACTED rather than added. The customer pays exactly the
// figure the app displayed, and the order still records a correct HT / TVA split
// for the invoice.
//
// Everything rounds once, at the end. Prisma hands back Decimal objects;
// Number() on them is exact at these magnitudes (DA amounts sit far below
// 2^53 centimes).

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Totals for a whole order from its priced lines.
 * Each line: { unitPrice (TTC), quantity, vatRate }
 */
export function orderTotals(lines) {
  let total = 0;
  let vatAmount = 0;

  for (const { unitPrice, quantity, vatRate } of lines) {
    const lineTTC = round2(Number(unitPrice) * quantity);
    const rate = Number(vatRate);
    // HT = TTC / (1 + rate)  =>  VAT = TTC - HT
    const lineHT = lineTTC / (1 + rate);
    total += lineTTC;
    vatAmount += lineTTC - lineHT;
  }

  total = round2(total);
  vatAmount = round2(vatAmount);
  // Derive subtotal by subtraction, so subtotal + vat === total always holds.
  const subtotal = round2(total - vatAmount);

  return { subtotal, vatAmount, total };
}

/** A single line's TTC total. */
export function lineTotal(unitPrice, quantity) {
  return round2(Number(unitPrice) * quantity);
}

/** Decimal -> number, for JSON responses. Prisma Decimals are not JSON-safe. */
export const dec = (d) => (d === null || d === undefined ? null : Number(d));
