-- Pre-migration investigation for the 2026-05-27 physical-audit cleanup.
-- READ-ONLY (BEGIN ... ROLLBACK). Surfaces the per-row detail + FK
-- references needed to finalize the destructive migration safely.
--
-- Run:  psql -d containers_prod -f audit-cleanup-investigate.sql
--
-- Companion to docs/AUDIT_MIGRATION.md. The audit unit list below is the
-- same 87 rows as audit-reconcile.sql — keep them in sync if either changes.

BEGIN;

CREATE TEMP TABLE audit (raw text, category text, expected text) ON COMMIT DROP;
INSERT INTO audit (raw, category, expected) VALUES
  ('XYZU220000-9','sh_dd','sh'),('XYZU220003-5','sh_dd','sh'),('XYZU220017-0','sh_dd','sh'),
  ('FAMU827092-0','flexbox','sh'),('FAMU827102-2','flexbox','sh'),('FAMU827166-0','flexbox','sh'),
  ('FAMU827157-3','flexbox','sh'),('FAMU827091-5','flexbox','sh'),('FAMU827160-8','flexbox','sh'),
  ('FAMU827175-8','flexbox','sh'),('FAMU827161-3','flexbox','sh'),('FAMU827094-1','flexbox','sh'),
  ('FAMU827090-0','flexbox','sh'),('FAMU827165-5','flexbox','sh'),('FAMU827149-1','flexbox','sh'),
  ('FAMU891888-6','flexbox','sh'),('FXLU892476-9','flexbox','sh'),
  ('CICU202837-0','ts_free','sh'),('UNSU001361-6','ts_free','sh'),('UNSU020983-0','ts_free','sh'),
  ('UNSU006625-7','ts_free','sh'),('TSQU000000-0','ts_free','sh'),('TRDU666203-5','ts_free','sh'),
  ('TRDU657039-2','ts_free','sh'),('UNSU009181-4','ts_free','sh'),('UNSU006245-7','ts_free','sh'),
  ('UNSU004759-7','ts_free','sh'),('UNSU003768-6','ts_free','sh'),
  ('XYZU200189-8','office_mod','sale'),('XYZU200215-3','office_mod','sale'),('XYZU200054-6','office_mod','sale'),
  ('HLXU355591-4','container_man','sale'),('UACU376874-6','container_man','sale'),('PCIU178340-4','container_man','sale'),
  ('JZPU210124-0','container_man','sale'),('TCKU426283-8','container_man','sale'),
  ('TRDU657642-5','airtight','sale'),('TRDU657649-3','airtight','sale'),('MOAU653437','airtight','sale'),
  ('TCKU287377-7','airtight','sale'),('ATSU000001-0','airtight','sale'),
  ('CAIU355169-4','sales','sale'),('DRYU246268-0','sales','sale'),('RFCU217783-4','sales','sale'),
  ('CMAU023271-5','sales','sale'),('TRHU310711-5','sales','sale'),('TRHU355649-8','sales','sale'),
  ('TRHU300793-9','sales','sale'),('TCLU305838-6','sales','sale'),('TCLU308783-0','sales','sale'),
  ('TCKU195927-0','sales','sale'),('TCLU328691-4','sales','sale'),('TCKU368016-0','sales','sale'),
  ('DRYU248824-2','sales','sale'),('TRDU196214-8','sales','sale'),('TRDU657687-3','sales','sale'),
  ('TCLU804792-8','sales','sale'),('WFHU403925-2','sales','sale'),('INKU227527-2','sales','sale'),
  ('TCNU828200-9','sales_40hc','sale'),('TCNU600486-3','sales_40hc','sale'),('TCLU530258-9','sales_40hc','sale'),
  ('TCLU556299-2','sales_40hc','sale'),('TCNU754813-6','sales_40hc','sale'),('TCNU996568-0','sales_40hc','sale'),
  ('TCLU513100-1','sales_40hc','sale'),('TCNU793536-7','sales_40hc','sale'),('DRYU922803-6','sales_40hc','sale'),
  ('DRYU921808-5','sales_40hc','sale'),('RFCU401104-0','sales_40hc','sale'),('DRYU951573-5','sales_40hc','sale'),
  ('DRYU936089-1','sales_40hc','sale'),('DRYU920773-2','sales_40hc','sale'),('DRYU928910-8','sales_40hc','sale'),
  ('DRYU921303-6','sales_40hc','sale'),('DRYU936183-5','sales_40hc','sale'),('DRYU992505-1','sales_40hc','sale'),
  ('RFCU402996-5','sales_40hc','sale'),('DRYU991378-6','sales_40hc','sale'),('WBPU700005-4','sales_40hc','sale'),
  ('DRYU987312-7','sales_40hc','sale'),('RFCU507256-5','sales_40hc','sale'),('TCLU528919-4','sales_40hc','sale'),
  ('TCLU530187-5','sales_40hc','sale'),('TCLU536204-2','sales_40hc','sale'),('TCLU838400-3','sales_40hc','sale'),
  ('SNPU600104-0','repair','unknown');
ALTER TABLE audit ADD COLUMN key text;
UPDATE audit SET key = upper(regexp_replace(raw, '[^A-Za-z0-9]', '', 'g'));

-- inventory + normalized key + FK reference counts, reused below.
CREATE TEMP VIEW inv AS
  SELECT i.id, i.unit_number, i.state::text AS state, i.acquisition_price,
         coalesce(array_length(i.photos,1),0) AS photos, i.date,
         upper(regexp_replace(trim(i.unit_number),'[^A-Za-z0-9]','','g')) AS key,
         (SELECT count(*) FROM invoice_containers ic WHERE ic.container_id = i.id) AS inv_refs,
         (SELECT count(*) FROM sold s WHERE s.inventory_id = i.id) AS sold_refs
  FROM inventory i;

\echo
\echo === A. AUDITED-AS-S&H rows in inventory -> DELETE candidates (verify refs=0)
\echo     (Flexbox + Times Square. You re-add these by hand as sh_inventory.)
SELECT v.id, v.unit_number, v.state, a.category, v.inv_refs, v.sold_refs, v.acquisition_price, v.photos
FROM inv v JOIN audit a ON a.key = v.key
WHERE a.expected = 'sh'
ORDER BY a.category, v.unit_number;

\echo
\echo === B. DUPLICATE unit groups (same normalized key >1) -> pick survivor
\echo     Keep the row with inv_refs/sold_refs > 0; delete the bare dupe.
SELECT v.key, v.id, v.unit_number, v.state, v.inv_refs, v.sold_refs, v.acquisition_price, v.photos, v.date
FROM inv v
WHERE v.key IN (SELECT key FROM inv GROUP BY key HAVING count(*) > 1)
ORDER BY v.key, (v.inv_refs + v.sold_refs) DESC, v.id;

\echo
\echo === C. MALFORMED unit_number (not AAAA######-# ) -> normalize or drop
\echo     Includes junk (TEST, blank, MOD REPAIR, 122024). Check refs before delete.
SELECT v.id, v.unit_number, v.state, v.inv_refs, v.sold_refs
FROM inv v
WHERE v.unit_number !~ '^[A-Z]{4}[0-9]{6}-[0-9]$'
ORDER BY v.state, v.unit_number;

\echo
\echo === D. FUZZY audit matches (first 10 chars) but NOT exact -> KEEP + fix unit#
\echo     These are audited boxes stored malformed. Do NOT outbound them.
SELECT a.raw AS audit_unit, v.id, v.unit_number AS db_unit, v.state, v.inv_refs, v.sold_refs
FROM inv v JOIN audit a ON left(v.key,10) = left(a.key,10) AND v.key <> a.key
ORDER BY a.raw;

\echo
\echo === E. OUTBOUND-SWEEP candidates: state in available/hold/pending, NOT in audit
\echo     (exact and fuzzy excluded). These are "DB says on lot, audit didn't find".
SELECT v.id, v.unit_number, v.state, v.inv_refs, v.sold_refs
FROM inv v
WHERE v.state IN ('available','hold','pending')
  AND v.key NOT IN (SELECT key FROM audit)
  AND left(v.key,10) NOT IN (SELECT left(key,10) FROM audit)
ORDER BY v.state, v.unit_number;

\echo
\echo === F. SWEEP COUNTS (how big is each transition)
SELECT
  (SELECT count(*) FROM inv WHERE state='sold'
     AND key NOT IN (SELECT key FROM audit)
     AND left(key,10) NOT IN (SELECT left(key,10) FROM audit))            AS sold_not_audited_to_outbound,
  (SELECT count(*) FROM inv WHERE state IN ('available','hold','pending')
     AND key NOT IN (SELECT key FROM audit)
     AND left(key,10) NOT IN (SELECT left(key,10) FROM audit))            AS avail_hold_not_audited,
  (SELECT count(*) FROM inv v JOIN audit a ON a.key=v.key WHERE a.expected='sh') AS sh_rows_to_delete,
  (SELECT count(*) FROM inv WHERE unit_number !~ '^[A-Z]{4}[0-9]{6}-[0-9]$')     AS malformed_unit_numbers;

ROLLBACK;
