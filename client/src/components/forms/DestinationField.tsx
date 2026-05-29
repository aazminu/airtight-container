import { useEffect, useRef, useState } from 'react';
import { APILoader } from '@googlemaps/extended-component-library/react';
import styles from './DestinationField.module.css';

// Destination display + edit-via-Places-picker. Stores a single text
// string ("Toms River, NJ 08753") — the underlying schema column on
// quote_line_items + sold rows is plain text. Editable only by picking
// from the Places dropdown; no free typing (operator directive — keeps
// destinations consistent with what the address resolver produces).

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined;

interface PlaceAddressComponent {
  types?: string[];
  longText?: string | null;
  shortText?: string | null;
}

function pickComponent(
  components: PlaceAddressComponent[],
  type: string,
  short = false,
): string {
  const match = components.find((c) => c.types?.includes(type));
  if (!match) return '';
  return (short ? match.shortText : match.longText) ?? '';
}

function formatDestination(components: PlaceAddressComponent[]): string {
  const city =
    pickComponent(components, 'locality') ||
    pickComponent(components, 'postal_town') ||
    pickComponent(components, 'sublocality');
  const state = pickComponent(components, 'administrative_area_level_1', true);
  const zip = pickComponent(components, 'postal_code');
  const cityState = [city, state].filter(Boolean).join(', ');
  return [cityState, zip].filter(Boolean).join(' ');
}

const getMaps = (): {
  importLibrary: (name: string) => Promise<Record<string, unknown>>;
} | null => {
  const w = window as unknown as {
    google?: {
      maps?: { importLibrary?: (name: string) => Promise<Record<string, unknown>> };
    };
  };
  if (w.google?.maps?.importLibrary) {
    return { importLibrary: w.google.maps.importLibrary };
  }
  return null;
};

function PlacesAutocomplete({
  onSelect,
}: {
  onSelect: (formatted: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 200; i += 1) {
        if (cancelled) return;
        if (getMaps()) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const maps = getMaps();
      if (!maps || cancelled) return;
      try {
        const placesLib = (await maps.importLibrary('places')) as {
          PlaceAutocompleteElement: new (opts: {
            includedRegionCodes?: string[];
          }) => HTMLElement;
        };
        if (cancelled) return;
        const element = new placesLib.PlaceAutocompleteElement({
          includedRegionCodes: ['us'],
        });
        element.addEventListener('gmp-select', async (ev: Event) => {
          try {
            const detail = (
              ev as unknown as {
                placePrediction?: {
                  toPlace?: () => {
                    fetchFields: (opts: { fields: string[] }) => Promise<void>;
                    addressComponents?: PlaceAddressComponent[] | null;
                  };
                };
              }
            ).placePrediction;
            const place = detail?.toPlace?.();
            if (!place) return;
            await place.fetchFields({ fields: ['addressComponents'] });
            if (cancelled) return;
            const formatted = formatDestination(place.addressComponents ?? []);
            if (formatted) onSelectRef.current(formatted);
          } catch {
            // swallow — operator picks a different match
          }
        });
        containerRef.current?.appendChild(element);
        elementRef.current = element;
      } catch {
        // SDK never loaded; field stays in read-only state
      }
    })();
    return () => {
      cancelled = true;
      elementRef.current?.remove();
      elementRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className={styles.placePicker} />;
}

interface Props {
  value: string | null;
  onChange: (next: string) => void;
  placeholder?: string;
}

export function DestinationField({ value, onChange, placeholder }: Props) {
  const [picking, setPicking] = useState(false);
  const handlePicked = (formatted: string) => {
    onChange(formatted);
    setPicking(false);
  };

  return (
    <div className={styles.wrap}>
      {GOOGLE_MAPS_API_KEY && <APILoader apiKey={GOOGLE_MAPS_API_KEY} />}
      {picking && GOOGLE_MAPS_API_KEY ? (
        <>
          <PlacesAutocomplete onSelect={handlePicked} />
          <button
            type="button"
            className={styles.changeBtn}
            onClick={() => setPicking(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <div className={styles.summary}>
          {value ? (
            <span className={styles.summaryText}>{value}</span>
          ) : (
            <span className={`${styles.summaryText} ${styles.placeholder}`}>
              {placeholder ?? 'No destination set'}
            </span>
          )}
          {GOOGLE_MAPS_API_KEY && (
            <button
              type="button"
              className={styles.changeBtn}
              onClick={() => setPicking(true)}
            >
              {value ? 'Change' : 'Pick'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
