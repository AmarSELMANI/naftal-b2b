-- Order placement, as one server-side atomic unit.
--
-- Why a database function instead of a sequence of Prisma calls: measured from
-- here, one round trip to Neon costs ~238ms, and this logic is 8-10 statements
-- (§5.11). As Prisma calls, "Confirm purchase" would take well over a second.
-- As one function it is a single round trip.
--
-- It is also the safer shape. The lock, the stock decrement, the credit check
-- and the inserts cannot be left half-applied by a connection that drops
-- mid-sequence, because there is no mid-sequence to drop in.

-- Order numbers come from a sequence, never COUNT(*)+1, which collides under
-- concurrency. Format keeps the CMD prefix the Orders screen already displays.
CREATE SEQUENCE IF NOT EXISTS order_no_seq START 1;

CREATE OR REPLACE FUNCTION place_order(
  p_company_id   uuid,
  p_user_id      uuid,
  p_items        jsonb,   -- [{"product_id": "...", "quantity": 2}, ...]
  p_payment_type text     -- 'immediate' | 'credit'
)
RETURNS TABLE (
  out_order_id  uuid,
  out_order_no  text,
  out_subtotal  numeric,
  out_vat       numeric,
  out_total     numeric,
  out_due_date  date
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_credit_limit numeric;
  v_term_days    int;
  v_outstanding  numeric := 0;
  v_total        numeric := 0;
  v_vat          numeric := 0;
  v_subtotal     numeric := 0;
  v_order_id     uuid;
  v_order_no     text;
  v_due          date := NULL;
  v_updated      int;
  v_item_count   int;
  v_match_count  int;
  r              record;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ORDER' USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 1. Lock this company's row.
  --
  -- The narrowest lock that makes the credit check safe: it serialises only
  -- this company's concurrent orders, never the whole table. Without it two
  -- orders can read the same outstanding balance, both conclude they fit under
  -- the ceiling, and both commit -- putting the company over its limit with no
  -- bug visible anywhere in the application code.
  ----------------------------------------------------------------------------
  SELECT
    COALESCE(c.credit_limit,
             (SELECT (value #>> '{}')::numeric FROM app_settings WHERE key = 'credit_limit')),
    COALESCE(c.credit_term_days,
             (SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'credit_term_days'))
  INTO v_credit_limit, v_term_days
  FROM companies c
  WHERE c.id = p_company_id AND c.approval_status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_APPROVED' USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Every requested product must exist. A plain JOIN would silently drop an
  --    unknown id and quietly bill for a shorter order than was requested.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_item_count FROM jsonb_array_elements(p_items);
  SELECT count(*) INTO v_match_count
  FROM jsonb_array_elements(p_items) i
  JOIN products p ON p.id = (i->>'product_id')::uuid;

  IF v_item_count <> v_match_count THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Price from the DATABASE and decrement stock atomically.
  --
  -- The UPDATE carries its own precondition, so the check and the write are one
  -- statement and no other transaction can slip between them. Nothing here
  -- trusts a number sent by the client -- that is how a 13,500 DA tire gets
  -- bought for 1 DA.
  --
  -- Prices are TTC (§10.4), so VAT is EXTRACTED: HT = TTC / (1 + rate).
  ----------------------------------------------------------------------------
  FOR r IN
    SELECT (i->>'product_id')::uuid AS pid,
           (i->>'quantity')::int    AS qty,
           p.unit_price, p.vat_rate, p.status
    FROM jsonb_array_elements(p_items) i
    JOIN products p ON p.id = (i->>'product_id')::uuid
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
    END IF;

    IF r.status <> 'active' THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE = 'P0001', DETAIL = r.pid::text;
    END IF;

    UPDATE product_stock
       SET quantity = quantity - r.qty, updated_at = now()
     WHERE product_id = r.pid AND quantity >= r.qty;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001', DETAIL = r.pid::text;
    END IF;

    v_total := v_total + round(r.unit_price * r.qty, 2);
    v_vat   := v_vat   + round(r.unit_price * r.qty, 2)
                       - round((r.unit_price * r.qty) / (1 + r.vat_rate), 2);
  END LOOP;

  v_total    := round(v_total, 2);
  v_vat      := round(v_vat, 2);
  -- Derived by subtraction so subtotal + vat = total always holds exactly.
  v_subtotal := round(v_total - v_vat, 2);

  ----------------------------------------------------------------------------
  -- 4. Credit gate.
  --
  -- The ceiling is what the company may owe AT ANY MOMENT, not a per-order cap
  -- (§10.1). Outstanding is computed, never stored: a counter column would be
  -- one fewer query and would drift the first time a payment path forgot to
  -- update it. The partial index on (company_id, payment_type, payment_state)
  -- makes this SUM trivial at this scale.
  ----------------------------------------------------------------------------
  IF p_payment_type = 'credit' THEN
    SELECT COALESCE(SUM(o.total - o.amount_paid), 0)
    INTO v_outstanding
    FROM orders o
    WHERE o.company_id = p_company_id
      AND o.payment_type = 'credit'
      AND o.payment_state <> 'paid'
      AND o.status <> 'cancelled';

    IF v_outstanding + v_total > v_credit_limit THEN
      RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED'
        USING ERRCODE = 'P0001',
              DETAIL = json_build_object(
                'limit', v_credit_limit,
                'outstanding', v_outstanding,
                'available', v_credit_limit - v_outstanding,
                'requested', v_total
              )::text;
    END IF;

    v_due := CURRENT_DATE + v_term_days;
  END IF;

  ----------------------------------------------------------------------------
  -- 5. Write the order and its lines.
  ----------------------------------------------------------------------------
  v_order_no := 'CMD-' || to_char(now(), 'YYYY') || '-'
                       || lpad(nextval('order_no_seq')::text, 6, '0');

  INSERT INTO orders (
    id, order_no, company_id, placed_by, status, payment_type,
    subtotal, vat_amount, total, amount_paid, payment_state, due_date,
    created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_order_no, p_company_id, p_user_id, 'confirmed',
    p_payment_type::"PaymentType", v_subtotal, v_vat, v_total, 0, 'unpaid',
    v_due, now(), now()
  )
  RETURNING id INTO v_order_id;

  -- unit_price and the name/image are SNAPSHOTS: a customer reopening a March
  -- order must see what they actually paid, not today's price. §3.3
  INSERT INTO order_items (
    id, order_id, product_id, quantity, unit_price, vat_rate,
    line_total, name_snapshot, image_snapshot
  )
  SELECT
    gen_random_uuid(),
    v_order_id,
    p.id,
    (i->>'quantity')::int,
    p.unit_price,
    p.vat_rate,
    round(p.unit_price * (i->>'quantity')::int, 2),
    p.display_name,
    p.image_url
  FROM jsonb_array_elements(p_items) i
  JOIN products p ON p.id = (i->>'product_id')::uuid;

  RETURN QUERY SELECT v_order_id, v_order_no, v_subtotal, v_vat, v_total, v_due;
END;
$$;
