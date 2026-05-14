// Modification description presets used by the invoice editor + create
// flow. Surfaced as <datalist> options so the description input still
// accepts free text but suggests the common billing items first.
//
// Source of truth lives in the `mod_presets` table; the admin Dashboard
// tab provides CRUD. The label-list hook below is module-cached so the
// many <input list> consumers across one screen share a single fetch.

import { useEffect, useState } from 'react';

export const MODIFICATION_DATALIST_ID = 'modification-presets';

export interface ModPreset {
  id: number;
  label: string;
  position: number;
  created_at: string;
}

let cachedFullPromise: Promise<ModPreset[]> | null = null;
const subscribers = new Set<(presets: ModPreset[]) => void>();

async function fetchFull(): Promise<ModPreset[]> {
  const res = await fetch('/api/v2/mod-presets', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: { presets: ModPreset[] } };
  return body.data.presets;
}

function loadFull(): Promise<ModPreset[]> {
  if (!cachedFullPromise) cachedFullPromise = fetchFull();
  return cachedFullPromise;
}

export function invalidateModPresets() {
  cachedFullPromise = null;
}

export function publishModPresets(presets: ModPreset[]) {
  cachedFullPromise = Promise.resolve(presets);
  subscribers.forEach((cb) => cb(presets));
}

export function useModPresetLabels(): string[] {
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
    const sub = (presets: ModPreset[]) => {
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
