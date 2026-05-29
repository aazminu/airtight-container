import { useEffect, useRef, useState } from 'react';
import { APILoader } from '@googlemaps/extended-component-library/react';
import styles from './AddressFields.module.css';

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

interface PickedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

function componentsToAddress(
  components: PlaceAddressComponent[],
): PickedAddress {
  const streetNumber = pickComponent(components, 'street_number');
  const route = pickComponent(components, 'route');
  const street = [streetNumber, route].filter(Boolean).join(' ');
  const city =
    pickComponent(components, 'locality') ||
    pickComponent(components, 'postal_town') ||
    pickComponent(components, 'sublocality');
  const state = pickComponent(components, 'administrative_area_level_1', true);
  const zip = pickComponent(components, 'postal_code');
  return { street, city, state, zip };
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

// Mounts the native <gmp-place-autocomplete> element (Places API New) into a
// container div. Emits the parsed address parts on selection. Rejects picks
// that don't include a street (e.g. operator picked a locality instead of a
// real address) and surfaces a hint so they can re-search.
function PlacesAutocomplete({
  onSelect,
  onInvalidPick,
}: {
  onSelect: (addr: PickedAddress) => void;
  onInvalidPick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  // Pin the latest callbacks so we don't rebind listeners on every render.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onInvalidPickRef = useRef(onInvalidPick);
  onInvalidPickRef.current = onInvalidPick;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // APILoader element triggers google.maps load; poll briefly for it.
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
            includedPrimaryTypes?: string[];
          }) => HTMLElement;
        };
        if (cancelled) return;

        // Restrict suggestions to street-level address types so the
        // operator can't accidentally accept a city- or region-level
        // result (which would land in the DB with empty street + zip
        // and silently fall back to the client's billing address on the
        // delivery sheet).
        const element = new placesLib.PlaceAutocompleteElement({
          includedRegionCodes: ['us'],
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
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
            const picked = componentsToAddress(place.addressComponents ?? []);
            if (!picked.street) {
              // Defense in depth — restriction above should prevent this,
              // but if the API returns a locality-only place we'd otherwise
              // silently store empty street + zip.
              onInvalidPickRef.current();
              return;
            }
            onSelectRef.current(picked);
          } catch {
            // swallow — user can pick a different match
          }
        });

        containerRef.current?.appendChild(element);
        elementRef.current = element;
      } catch {
        // Places API didn't load; nothing to render.
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

export interface AddressValue {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface Props {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  // When true, render a recipient-name field above the address picker.
  includeName?: boolean;
  nameLabel?: string;
}

const formatSummary = (v: AddressValue): string =>
  [v.street, [v.city, v.state].filter(Boolean).join(', '), v.zip]
    .filter(Boolean)
    .join(' · ');

export function AddressFields({
  value,
  onChange,
  includeName = true,
  nameLabel = 'Recipient name',
}: Props) {
  const [pickError, setPickError] = useState<string | null>(null);

  const hasAddress = Boolean(
    value.street || value.city || value.state || value.zip,
  );

  const handlePicked = (picked: PickedAddress) => {
    setPickError(null);
    onChange({
      ...value,
      street: picked.street,
      city: picked.city,
      state: picked.state,
      zip: picked.zip,
    });
  };

  const clearAddress = () => {
    setPickError(null);
    onChange({ ...value, street: '', city: '', state: '', zip: '' });
  };

  return (
    <div className={styles.wrap}>
      {GOOGLE_MAPS_API_KEY && <APILoader apiKey={GOOGLE_MAPS_API_KEY} />}
      {includeName && (
        <label className={styles.field}>
          <span className={styles.label}>{nameLabel}</span>
          <input
            type="text"
            className={styles.input}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
      )}
      <div className={styles.field}>
        <span className={styles.label}>Address</span>
        {hasAddress ? (
          <div className={styles.summary}>
            <span className={styles.summaryText}>{formatSummary(value)}</span>
            <button
              type="button"
              className={styles.changeBtn}
              onClick={clearAddress}
            >
              Change
            </button>
          </div>
        ) : GOOGLE_MAPS_API_KEY ? (
          <>
            <PlacesAutocomplete
              onSelect={handlePicked}
              onInvalidPick={() =>
                setPickError(
                  'Pick a specific street address — that result has no street number.',
                )
              }
            />
            {pickError && <div className={styles.pickError}>{pickError}</div>}
          </>
        ) : (
          <div className={styles.notice}>
            Address autofill unavailable. Set VITE_GOOGLE_MAPS_API_KEY to
            enable.
          </div>
        )}
      </div>
    </div>
  );
}
