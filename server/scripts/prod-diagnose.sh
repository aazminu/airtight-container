#!/usr/bin/env bash
# Read-only diagnostic snapshot of prod state, for the bugs reported
# on 2026-06-06 (quote_lines crash + quote email non-delivery).
#
# Pulls only what we need to answer:
#   A. Does the quote_line_items table exist (and quote_lines NOT) on prod?
#   B. Did migrations 0018/0022/0023 actually land on prod?
#   C. What state is the affected box (FAMU 827164-0) and its quote in?
#   D. Are any quote/invoice sends in flight or stuck?
#
# Output: ~/airtight-cutover/diagnose-YYYYMMDD-HHMMSS/
#   schema-quote.sql              \pg_dump schema-only for quote_* tables
#   schema-pickup.sql             \pg_dump schema-only for pickup_* tables
#   info-schema-summary.txt       \one row per relevant table
#   migrations-applied.txt        \drizzle journal (if present)
#   famu-827164-0.txt             \box history for the operator's case
#   recent-quotes.txt             \last 20 quotes + send status
#   send-bcc-env.txt              \what SEND_BCC and RESEND prefix are on host
#
# Safe to re-run. Does not mutate prod.
set -euo pipefail

SSH_KEY="${HOME}/airtight.pem"
SSH_HOST="ubuntu@airtightshippingcontainer.com"
PROD_DB="containers_prod"

TS="$(date -u +%Y%m%d-%H%M%S)"
OUT_DIR="${HOME}/airtight-cutover/diagnose-${TS}"
mkdir -p "${OUT_DIR}"

echo "[diagnose] output dir: ${OUT_DIR}"

ssh_psql() {
  # Quote-safe single-query runner against prod.
  local q="$1"
  ssh -i "${SSH_KEY}" "${SSH_HOST}" \
    "sudo -u postgres psql -d ${PROD_DB} -v ON_ERROR_STOP=1 -P pager=off -c \"$q\""
}

ssh_psql_file() {
  # Run a heredoc-style script. Pass the SQL on stdin.
  ssh -i "${SSH_KEY}" "${SSH_HOST}" \
    "sudo -u postgres psql -d ${PROD_DB} -v ON_ERROR_STOP=1 -P pager=off -A -F $'\t'"
}

echo "[diagnose] A. schema for quote_*, pickup_*, sh_inventory"
ssh -i "${SSH_KEY}" "${SSH_HOST}" "
  sudo -u postgres pg_dump -d ${PROD_DB} --schema-only \
    -t 'quote*' -t 'pickup*' -t 'sh_inventory' -t 'invoices' -t 'invoice_*' 2>/dev/null
" > "${OUT_DIR}/schema-quote.sql"

echo "[diagnose] B. table presence / column shape"
ssh_psql_file > "${OUT_DIR}/info-schema-summary.txt" <<'SQL'
\echo === existence check ===
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN (
     'quotes','quote_line_items','quote_lines',
     'quote_line_modifications',
     'pickup_numbers','pickup_number_assignments','sh_inventory',
     'invoices','invoice_lines','invoice_line_items'
   )
 ORDER BY table_name;

\echo === quote_line_items columns ===
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='quote_line_items'
 ORDER BY ordinal_position;

\echo === pickup_numbers columns (0022) ===
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='pickup_numbers'
 ORDER BY ordinal_position;

\echo === sh_inventory pickup_damage (0022) ===
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sh_inventory'
   AND column_name IN ('pickup_damage','pickup_number_id')
 ORDER BY ordinal_position;

\echo === trigger from 0023 ===
SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
 WHERE event_object_schema='public'
   AND event_object_table='pickup_number_assignments';
SQL

echo "[diagnose] B'. drizzle journal (if used)"
ssh_psql_file > "${OUT_DIR}/migrations-applied.txt" <<'SQL'
SELECT to_regclass('public.__drizzle_migrations') AS drizzle_table;
\if :{?drizzle_table}
\echo (drizzle table existed; dumping)
SELECT * FROM __drizzle_migrations ORDER BY id;
\endif
SQL

echo "[diagnose] C. FAMU 827164-0 history (the box in the operator report)"
ssh_psql_file > "${OUT_DIR}/famu-827164-0.txt" <<'SQL'
\echo === inventory row(s) for FAMU 827164-0 ===
SELECT id, unit_number, status, created_at, deleted_at
  FROM inventory
 WHERE trim(unit_number) = 'FAMU 827164-0';

\echo === quotes referencing this unit (line description match) ===
SELECT q.id, q.quote_number, q.status, q.sent_at, q.created_at,
       q.client_id, li.id AS line_id, li.description, li.sale_price
  FROM quotes q
  LEFT JOIN quote_line_items li ON li.quote_id = q.id
 WHERE q.deleted_at IS NULL
   AND (li.description ILIKE '%827164%' OR li.description ILIKE '%FAMU 8271%')
 ORDER BY q.id DESC
 LIMIT 20;

\echo === any sold/release rows referencing this unit ===
SELECT 'sold' AS src, id::text, outbound_date::text, inbound_date::text
  FROM sold
 WHERE inventory_id IN (SELECT id FROM inventory WHERE trim(unit_number) = 'FAMU 827164-0')
 ORDER BY id DESC
 LIMIT 10;
SQL

echo "[diagnose] D. recent quote send activity (deliverability sanity)"
ssh_psql_file > "${OUT_DIR}/recent-quotes.txt" <<'SQL'
\echo === last 20 quotes: sent_at, status, customer email domain ===
SELECT q.id, q.quote_number, q.status, q.sent_at,
       split_part(cl.contact_email, '@', 2) AS recipient_domain,
       q.created_at
  FROM quotes q
  JOIN clients cl ON q.client_id = cl.id
 WHERE q.deleted_at IS NULL
 ORDER BY q.id DESC
 LIMIT 20;

\echo === quotes that were generated but never marked sent ===
SELECT q.id, q.quote_number, q.status, q.created_at,
       split_part(cl.contact_email, '@', 2) AS recipient_domain
  FROM quotes q
  JOIN clients cl ON q.client_id = cl.id
 WHERE q.deleted_at IS NULL
   AND q.sent_at IS NULL
   AND q.created_at > NOW() - INTERVAL '14 days'
 ORDER BY q.id DESC;
SQL

echo "[diagnose] E. host env (SEND_BCC + RESEND key prefix, NOT the key)"
ssh -i "${SSH_KEY}" "${SSH_HOST}" '
  set +x
  cd ~/airtight-container || exit 0
  grep -E "^(SEND_BCC|RESEND|CORS_ORIGIN|BETTER_AUTH_URL)" .env 2>/dev/null \
    | sed "s/\(RESEND=re_[a-zA-Z0-9]\{6\}\).*/\1…/"
  echo "---"
  docker compose ps 2>/dev/null
  echo "---"
  docker compose exec -T backend printenv 2>/dev/null \
    | grep -E "^(SEND_BCC|RESEND|NODE_ENV)" \
    | sed "s/\(RESEND=re_[a-zA-Z0-9]\{6\}\).*/\1…/"
' > "${OUT_DIR}/send-bcc-env.txt" 2>&1

echo "[diagnose] F. backend log tail (Resend errors in last 24h)"
ssh -i "${SSH_KEY}" "${SSH_HOST}" '
  docker logs --since 24h airtight-container-backend-1 2>&1 \
    | grep -E "quote\.email|quote\.promote|resend|Resend|quote_lines" \
    | tail -200
' > "${OUT_DIR}/recent-backend-errors.txt" 2>&1 || true

echo ""
echo "[diagnose] done. Artifacts in:"
echo "  ${OUT_DIR}"
ls -la "${OUT_DIR}"
