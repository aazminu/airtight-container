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

interface Queryable {
	query: (
		text: string,
		params?: unknown[],
	) => Promise<{ rows: Array<{ id: number }> }>;
}

export function normalizeUnitNumber(raw?: string | null): string {
	return (raw ?? "").trim().toUpperCase();
}

// Returns the id of an existing 'available' inventory row with the same
// unit number, or null if the intake is clear to proceed. `exec` is any
// pg-style query runner (the db wrapper in the route, or a transaction
// client in tests).
export async function findAvailableDuplicate(
	exec: Queryable,
	unitNumber?: string | null,
): Promise<number | null> {
	const norm = normalizeUnitNumber(unitNumber);
	if (!norm) return null;
	const { rows } = await exec.query(
		`SELECT id FROM inventory
		 WHERE upper(btrim(unit_number)) = $1
		   AND state = 'available'
		 LIMIT 1`,
		[norm],
	);
	return rows[0]?.id ?? null;
}
