// Container-damage presets used by intake (sales + S&H) and InventoryEditor.
// Same pattern as sizePresets / modificationPresets.

import { useEffect, useState } from 'react';

export const DAMAGE_DATALIST_ID = 'damage-presets';

export interface DamagePreset {
  id: number;
  label: string;
  position: number;
  created_at: string;
}

let cachedFullPromise: Promise<DamagePreset[]> | null = null;
const subscribers = new Set<(presets: DamagePreset[]) => void>();

async function fetchFull(): Promise<DamagePreset[]> {
  const res = await fetch('/api/v2/damage-presets', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data: { presets: DamagePreset[] } };
  return body.data.presets;
}

function loadFull(): Promise<DamagePreset[]> {
  if (!cachedFullPromise) cachedFullPromise = fetchFull();
  return cachedFullPromise;
}

export function invalidateDamagePresets() {
  cachedFullPromise = null;
}

export function publishDamagePresets(presets: DamagePreset[]) {
  cachedFullPromise = Promise.resolve(presets);
  subscribers.forEach((cb) => cb(presets));
}

export function useDamagePresetLabels(): string[] {
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
    const sub = (presets: DamagePreset[]) => {
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
