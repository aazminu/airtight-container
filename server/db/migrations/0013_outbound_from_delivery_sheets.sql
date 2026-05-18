-- PR 9.7: outbound state-flip driven by delivery-sheet date.
--
-- Replaces the deleted "Mark Outbound" button (PR 4.1) with an
-- automatic state-flip: when a delivery sheet's delivery_date is in
-- the past and its linked container is still 'sold', flip the
-- container to 'outbound'. Runtime path is wired in
-- server/lib/outbound-from-delivery.ts (eager on report create +
-- regenerate, plus a daily cron at 05:00 ET).
--
-- This migration is the one-shot backfill: walk every existing
-- delivery-sheet report and apply the rule once at deploy time. The
-- runtime code from this PR forward keeps it current.
--
-- Sales only. S&H boxes have a separate lifecycle managed by
-- /api/v2/sh-inventory.
--
-- Also stamps sold.outbound_date so the legacy /api/v1/inventory join
-- (which the /inventory Sold tab consumes) shows the right date next
-- to the flipped row.

-- Step 1: flip inventory.state from 'sold' to 'outbound' for every
-- container that has any delivery-sheet report with a past delivery_date.
UPDATE inventory inv
   SET state = 'outbound'
  FROM (
    SELECT (r.parameters->>'container_id')::int AS container_id
      FROM reports r
     WHERE r.report_type = 'delivery_sheet'
       AND r.parameters ? 'container_id'
       AND COALESCE(
             (r.resolved_data->>'delivery_date')::timestamptz,
             (r.parameters->>'delivery_date')::timestamptz
           ) <= NOW()
     GROUP BY 1
  ) AS due
 WHERE inv.id = due.container_id
   AND inv.state = 'sold';

-- Step 2: stamp sold.outbound_date with the most recent delivery-sheet
-- date for each newly-flipped container, when the sold row's
-- outbound_date is null (don't overwrite anything the operator already
-- typed).
UPDATE sold s
   SET outbound_date = latest.delivery_date
  FROM (
    SELECT
      (r.parameters->>'container_id')::int AS container_id,
      MAX(
        COALESCE(
          (r.resolved_data->>'delivery_date')::timestamptz,
          (r.parameters->>'delivery_date')::timestamptz
        )
      ) AS delivery_date
      FROM reports r
     WHERE r.report_type = 'delivery_sheet'
       AND r.parameters ? 'container_id'
       AND COALESCE(
             (r.resolved_data->>'delivery_date')::timestamptz,
             (r.parameters->>'delivery_date')::timestamptz
           ) <= NOW()
     GROUP BY 1
  ) AS latest
  JOIN inventory inv ON inv.id = latest.container_id
 WHERE s.inventory_id = latest.container_id
   AND inv.state = 'outbound'
   AND s.outbound_date IS NULL;
