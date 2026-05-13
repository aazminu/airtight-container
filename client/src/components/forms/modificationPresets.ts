// Modification description presets used by the invoice editor + create
// flow. Surfaced as <datalist> options so the description input still
// accepts free text but suggests the common billing items first.
//
// Owner-supplied list (2026-05-13). Will move to an admin-editable
// table in a future PR (see PLAN.md "Open follow-ups"). Until then,
// edits to this list are code-only.

export const MODIFICATION_PRESETS: readonly string[] = [
  'Installation of Rollup Door',
  'Paint Job',
  'Installation of Man Door',
  'Installation of Window',
];

export const MODIFICATION_DATALIST_ID = 'modification-presets';
