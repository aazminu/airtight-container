// Container-size presets used by intake (sales + S&H) and InventoryEditor.
// Surfaced as <datalist> options so the size input still accepts free
// text (legacy rows like '20'' or '45'HC' stay editable) but suggests the
// admin-curated list first.
//
// Source of truth lives in the `size_presets` table; the admin Dashboard
// tab provides CRUD. The label-list hook is module-cached so co-mounted
// <input list> consumers share a single fetch.

import { useEffect, useState } from 'react';

export const SIZE_DATALIST_ID = 'size-presets';

export interface SizePreset {
  id: number;
  label: string;
  position: number;
  created_at: string;
}

let cachedFullPromise: Promise<SizePreset[]> | null = null;
const subscribers = new Set<(presets: SizePreset[]) => void>();

async function fetchFull(): Promise<SizePreset[]> {
  const res = await fetch('/api/v2/size-presets', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: { presets: SizePreset[] } };
  return body.data.presets;
}

function loadFull(): Promise<SizePreset[]> {
  if (!cachedFullPromise) cachedFullPromise = fetchFull();
  return cachedFullPromise;
}

export function invalidateSizePresets() {
  cachedFullPromise = null;
}

export function publishSizePresets(presets: SizePreset[]) {
  cachedFullPromise = Promise.resolve(presets);
  subscribers.forEach((cb) => cb(presets));
}

export function useSizePresetLabels(): string[] {
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    loadFull()
      .then((presets) => {
        if (active) setLabels(presets.map((p) => p.label));
      })
      .catch(() => {
        if (active) setLabels([]);
      });
    const sub = (presets: SizePreset[]) => {
      if (active) setLabels(presets.map((p) => p.label));
    };
    subscribers.add(sub);
    return () => {
      active = false;
      subscribers.delete(sub);
    };
  }, []);
  return labels;
}
