-- Physical-audit ⇆ database reconciliation (captured 2026-05-27).
-- Read-only: builds a TEMP table of the audited unit numbers and diffs
-- against inventory (sales) + sh_inventory (storage & handling).
--
-- Run against prod (or the mirror):
--   psql "$DATABASE_URL" -f server/scripts/audit-reconcile.sql
--
-- Matching key: strip every non-alphanumeric char, uppercase. So the
-- audit's "XYZU220000-9" compares equal to a stored "XYZU2200009".
-- The flat-rate Times Square boxes (digits only in the audit) are NOT
-- included — they can't be resolved to unit numbers yet.

BEGIN;

CREATE TEMP TABLE audit (raw text, category text, expected text) ON COMMIT DROP;

INSERT INTO audit (raw, category, expected) VALUES
  -- S&H: 20' double-door
  ('XYZU220000-9','sh_dd','sh'),
  ('XYZU220003-5','sh_dd','sh'),
  ('XYZU220017-0','sh_dd','sh'),
  -- Flexbox 20'DV (S&H)
  ('FAMU827092-0','flexbox','sh'),
  ('FAMU827102-2','flexbox','sh'),
  ('FAMU827166-0','flexbox','sh'),
  ('FAMU827157-3','flexbox','sh'),
  ('FAMU827091-5','flexbox','sh'),
  ('FAMU827160-8','flexbox','sh'),
  ('FAMU827175-8','flexbox','sh'),
  ('FAMU827161-3','flexbox','sh'),
  ('FAMU827094-1','flexbox','sh'),
  ('FAMU827090-0','flexbox','sh'),
  ('FAMU827165-5','flexbox','sh'),
  ('FAMU827149-1','flexbox','sh'),
  ('FAMU891888-6','flexbox','sh'),
  ('FXLU892476-9','flexbox','sh'),
  -- Times Square: $0/month free stock (treat as S&H, never invoiced)
  ('CICU202837-0','ts_free','sh'),
  ('UNSU001361-6','ts_free','sh'),
  ('UNSU020983-0','ts_free','sh'),
  ('UNSU006625-7','ts_free','sh'),
  ('TSQU000000-0','ts_free','sh'),
  ('TRDU666203-5','ts_free','sh'),
  ('TRDU657039-2','ts_free','sh'),
  ('UNSU009181-4','ts_free','sh'),
  ('UNSU006245-7','ts_free','sh'),
  ('UNSU004759-7','ts_free','sh'),
  ('UNSU003768-6','ts_free','sh'),
  -- Sales: office-mod boxes
  ('XYZU200189-8','office_mod','sale'),
  ('XYZU200215-3','office_mod','sale'),
  ('XYZU200054-6','office_mod','sale'),
  -- Sales: Container Man
  ('HLXU355591-4','container_man','sale'),
  ('UACU376874-6','container_man','sale'),
  ('PCIU178340-4','container_man','sale'),
  ('JZPU210124-0','container_man','sale'),
  ('TCKU426283-8','container_man','sale'),
  -- Sales: Airtight / painted
  ('TRDU657642-5','airtight','sale'),
  ('TRDU657649-3','airtight','sale'),
  ('MOAU653437','airtight','sale'),
  ('TCKU287377-7','airtight','sale'),
  ('ATSU000001-0','airtight','sale'),
  -- Sales: main list
  ('CAIU355169-4','sales','sale'),
  ('DRYU246268-0','sales','sale'),
  ('RFCU217783-4','sales','sale'),
  ('CMAU023271-5','sales','sale'),
  ('TRHU310711-5','sales','sale'),
  ('TRHU355649-8','sales','sale'),
  ('TRHU300793-9','sales','sale'),
  ('TCLU305838-6','sales','sale'),
  ('TCLU308783-0','sales','sale'),
  ('TCKU195927-0','sales','sale'),
  ('TCLU328691-4','sales','sale'),
  ('TCKU368016-0','sales','sale'),
  ('DRYU248824-2','sales','sale'),
  ('TRDU196214-8','sales','sale'),
  ('TRDU657687-3','sales','sale'),
  ('TCLU804792-8','sales','sale'),
  ('WFHU403925-2','sales','sale'),
  ('INKU227527-2','sales','sale'),
  -- Sales: 40'HC list
  ('TCNU828200-9','sales_40hc','sale'),
  ('TCNU600486-3','sales_40hc','sale'),
  ('TCLU530258-9','sales_40hc','sale'),
  ('TCLU556299-2','sales_40hc','sale'),
  ('TCNU754813-6','sales_40hc','sale'),
  ('TCNU996568-0','sales_40hc','sale'),
  ('TCLU513100-1','sales_40hc','sale'),
  ('TCNU793536-7','sales_40hc','sale'),
  ('DRYU922803-6','sales_40hc','sale'),
  ('DRYU921808-5','sales_40hc','sale'),
  ('RFCU401104-0','sales_40hc','sale'),
  ('DRYU951573-5','sales_40hc','sale'),
  ('DRYU936089-1','sales_40hc','sale'),
  ('DRYU920773-2','sales_40hc','sale'),
  ('DRYU928910-8','sales_40hc','sale'),
  ('DRYU921303-6','sales_40hc','sale'),
  ('DRYU936183-5','sales_40hc','sale'),
  ('DRYU992505-1','sales_40hc','sale'),
  ('RFCU402996-5','sales_40hc','sale'),
  ('DRYU991378-6','sales_40hc','sale'),
  ('WBPU700005-4','sales_40hc','sale'),
  ('DRYU987312-7','sales_40hc','sale'),
  ('RFCU507256-5','sales_40hc','sale'),
  ('TCLU528919-4','sales_40hc','sale'),
  ('TCLU530187-5','sales_40hc','sale'),
  ('TCLU536204-2','sales_40hc','sale'),
  ('TCLU838400-3','sales_40hc','sale'),
  -- Repair (table TBD)
  ('SNPU600104-0','repair','unknown');

-- Normalized matching key for the audit rows.
ALTER TABLE audit ADD COLUMN key text;
UPDATE audit SET key = upper(regexp_replace(raw, '[^A-Za-z0-9]', '', 'g'));

-- Every unit the DB knows about, both tables, normalized the same way.
CREATE TEMP VIEW db_units AS
  SELECT 'inventory' AS source,
         unit_number,
         state::text AS state,
         (state <> 'outbound') AS present,  -- physically on the lot per DB
         upper(regexp_replace(trim(unit_number), '[^A-Za-z0-9]', '', 'g')) AS key
  FROM inventory
  UNION ALL
  SELECT 'sh_inventory' AS source,
         unit_number,
         state::text AS state,
         (state <> 'checked_out') AS present,
         upper(regexp_replace(trim(unit_number), '[^A-Za-z0-9]', '', 'g')) AS key
  FROM sh_inventory;

\echo
\echo ========================================================================
\echo  0. HEADLINE COUNTS
\echo ========================================================================
SELECT
  (SELECT count(*) FROM audit)                                          AS audited_units,
  (SELECT count(*) FROM audit a JOIN db_units d ON d.key = a.key)       AS audited_matched_in_db,
  (SELECT count(*) FROM audit a LEFT JOIN db_units d ON d.key = a.key
     WHERE d.key IS NULL)                                               AS audited_missing_from_db,
  (SELECT count(*) FROM db_units d LEFT JOIN audit a ON a.key = d.key
     WHERE a.key IS NULL AND d.present)                                 AS db_present_not_audited;

\echo
\echo ========================================================================
\echo  1. AUDITED but NOT in DB  (exact match) -> need a record created
\echo ========================================================================
SELECT a.category, a.expected, a.raw
FROM audit a
LEFT JOIN db_units d ON d.key = a.key
WHERE d.key IS NULL
ORDER BY a.category, a.raw;

\echo
\echo ------------------------------------------------------------------------
\echo  1b. ...of those, FUZZY hits on first 10 chars (check-digit / typo)
\echo ------------------------------------------------------------------------
SELECT a.raw AS audit_raw, d.source, d.state, d.unit_number AS db_unit
FROM audit a
JOIN db_units d ON left(d.key, 10) = left(a.key, 10)
WHERE a.key NOT IN (SELECT key FROM db_units)
ORDER BY a.raw;

\echo
\echo ========================================================================
\echo  2. AUDITED and FOUND in DB  (with state + category-mismatch flag)
\echo ========================================================================
SELECT
  a.raw,
  a.category    AS audit_cat,
  a.expected    AS expected_tbl,
  d.source      AS found_in,
  d.state,
  CASE
    WHEN a.expected = 'sh'   AND d.source <> 'sh_inventory' THEN 'MISMATCH: audit=S&H, db=sales'
    WHEN a.expected = 'sale' AND d.source <> 'inventory'    THEN 'MISMATCH: audit=sale, db=S&H'
    ELSE ''
  END           AS flag
FROM audit a
JOIN db_units d ON d.key = a.key
ORDER BY (CASE WHEN a.expected = 'sh' AND d.source <> 'sh_inventory'
                 OR a.expected = 'sale' AND d.source <> 'inventory'
               THEN 0 ELSE 1 END), a.category, a.raw;

\echo
\echo ========================================================================
\echo  3. DB says PRESENT but NOT in the audit -> investigate (ghost / unsold)
\echo     inventory.state <> outbound  OR  sh_inventory.state <> checked_out
\echo ========================================================================
SELECT d.source, d.state, d.unit_number
FROM db_units d
LEFT JOIN audit a ON a.key = d.key
WHERE a.key IS NULL AND d.present
ORDER BY d.source, d.state, d.unit_number;

ROLLBACK;
