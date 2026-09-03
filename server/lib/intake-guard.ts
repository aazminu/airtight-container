// Intake duplicate guard.
//
// A container's unit number is unique in the *physical* yard at any one
// moment, but not over time — boxes churn (arrive, leave, and a fresh box
// under the same recycled ISO number arrives later). So we deliberately
// allow many rows per unit number as long as the prior ones have left the
// yard (state 'sold' / 'outbound' / 'hold'), and only refuse an intake when
// a row with the same number is still sitting in inventory as 'available'.
//
// This is what stops the double-entry we saw during the "Container Man"
// setup: a box already in the yard under one release got re-added under a
// new one, leaving two 'available' rows for a single physical container.
//
// Comparison follows the rest of v1/inventory.js: trim + upper-case, no
// inner-space/dash stripping — unit numbers are stored canonical
// ("LLLL ######-#") and intake formats to the same shape before submit.
//
// The same check guards unit-number rewrites (audit corrections, the plain
// edit form) and has an S&H-table counterpart, since sales and S&H are
// separate tables. Both take an optional `excludeId` so a row being edited
// doesn't conflict with itself, and both should be run under
// `lockUnitNumber` inside a transaction so a check-then-write isn't racy
// against a second submit for the same unit number (e.g. a double-tap).

interface Queryable {
	query: (
		text: string,
		params?: unknown[],
	) => Promise<{ rows: Array<{ id: number }> }>;
}

export function normalizeUnitNumber(raw?: string | null): string {
	return (raw ?? "").trim().toUpperCase();
}

// Acquires a transaction-scoped advisory lock keyed on the normalized unit
// number. Caller must already have a transaction open on `exec`; the lock
// releases at COMMIT/ROLLBACK. Serializes concurrent check-then-write
// sequences for the same unit number instead of letting them both pass the
// SELECT before either write commits. No-op for a blank unit number — there's
// no shared key to protect and the write will fail its own NOT NULL/required
// check regardless.
export async function lockUnitNumber(
	exec: Queryable,
	unitNumber?: string | null,
): Promise<void> {
	const norm = normalizeUnitNumber(unitNumber);
	if (!norm) return;
	await exec.query("SELECT pg_advisory_xact_lock(hashtext($1))", [norm]);
}

// Returns the id of an existing 'available' inventory row with the same
// unit number, or null if the intake/edit is clear to proceed. `exec` is any
// pg-style query runner (the db wrapper in the route, or a transaction
// client in tests). `excludeId` omits a specific row from the match — pass
// the row's own id when checking a rename so it can't conflict with itself.
export async function findAvailableDuplicate(
	exec: Queryable,
	unitNumber?: string | null,
	excludeId?: number | null,
): Promise<number | null> {
	const norm = normalizeUnitNumber(unitNumber);
	if (!norm) return null;
	const { rows } = await exec.query(
		`SELECT id FROM inventory
		 WHERE upper(btrim(unit_number)) = $1
		   AND state = 'available'
		   AND ($2::int IS NULL OR id != $2::int)
		 LIMIT 1`,
		[norm, excludeId ?? null],
	);
	return rows[0]?.id ?? null;
}

// S&H counterpart of findAvailableDuplicate. S&H boxes churn the same way
// sales containers do, but through the sh_state enum (pending → in_storage →
// checked_out): a box already 'checked_out' has left, so a fresh box under
// the same recycled unit number is fine. Only 'pending' or 'in_storage' —
// still physically on-site — blocks a second live intake, since sh-month-end
// bills per row and a duplicate live row means double-billing one box.
export async function findLiveShDuplicate(
	exec: Queryable,
	unitNumber?: string | null,
	excludeId?: number | null,
): Promise<number | null> {
	const norm = normalizeUnitNumber(unitNumber);
	if (!norm) return null;
	const { rows } = await exec.query(
		`SELECT id FROM sh_inventory
		 WHERE upper(btrim(unit_number)) = $1
		   AND state IN ('pending', 'in_storage')
		   AND ($2::int IS NULL OR id != $2::int)
		 LIMIT 1`,
		[norm, excludeId ?? null],
	);
	return rows[0]?.id ?? null;
}
