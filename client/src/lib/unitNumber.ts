// Display-only formatting for container unit numbers: insert a space
// between the alpha owner prefix and the serial digits, e.g.
// "TCLU1234567" -> "TCLU 1234567", "TCLU305838-6" -> "TCLU 305838-6".
// Storage is unchanged (the stored-vs-display decision is the separate
// audit-migration call). No-ops on values that don't start with letters
// (single-digit Times-Square labels, already-spaced values, blanks).
export function formatUnitNumber(
  unit: string | null | undefined,
): string {
  if (!unit) return '';
  return unit.trim().replace(/^([A-Za-z]+)(\d.*)$/, '$1 $2');
}
