import { useEffect, useRef } from 'react';
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

// google.maps types aren't installed; minimal accessor.
const getMaps = (): {
  importLibrary: (name: string) => Promise<Record<string, unknown>>;
} | null => {
  const w = window as unknown as {
    google?: { maps?: { importLibrary?: (name: string) => Promise<Record<string, unknown>> } };
  };
  if (w.google?.maps?.importLibrary) {
    return { importLibrary: w.google.maps.importLibrary };
  }
  return null;
};

// New Places UI Kit element — gives the standard "suggestions dropdown
// under the input" UX backed by Places API (New). Mounted imperatively
// because GMPX doesn't wrap it.
function PlacesAutocomplete({
  onSelect,
}: {
  onSelect: (addr: PickedAddress) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // APILoader element triggers google.maps load; poll briefly for
      // the global to come online.
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

        element.addEventListener(
          'gmp-select',
          async (ev: Event) => {
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
              onSelect(componentsToAddress(place.addressComponents ?? []));
            } catch {
              // swallow — manual fields still work
            }
          },
        );

        containerRef.current?.appendChild(element);
        elementRef.current = element;
      } catch {
        // Places API didn't load; manual fields remain usable.
      }
    })();

    return () => {
      cancelled = true;
      elementRef.current?.remove();
      elementRef.current = null;
    };
    // onSelect is stable in our callers (recreated on each render but
    // we only care about the latest at event time, captured via ref-like
    // closure). Running this effect once is what mounts the element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // When true, render a "Recipient name" field above the address.
  includeName?: boolean;
  nameLabel?: string;
}

export function AddressFields({
  value,
  onChange,
  includeName = true,
  nameLabel = 'Recipient name',
}: Props) {
  const set = <K extends keyof AddressValue>(key: K, v: AddressValue[K]) =>
    onChange({ ...value, [key]: v });

  const handlePicked = (picked: PickedAddress) => {
    onChange({
      ...value,
      street: picked.street || value.street,
      city: picked.city || value.city,
      state: picked.state || value.state,
      zip: picked.zip || value.zip,
    });
  };

  return (
    <div className={styles.wrap}>
      {GOOGLE_MAPS_API_KEY && (
        <div className={styles.field}>
          <span className={styles.label}>Search address</span>
          <APILoader apiKey={GOOGLE_MAPS_API_KEY} />
          <PlacesAutocomplete onSelect={handlePicked} />
        </div>
      )}
      {includeName && (
        <label className={styles.field}>
          <span className={styles.label}>{nameLabel}</span>
          <input
            type="text"
            className={styles.input}
            value={value.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
      )}
      <label className={styles.field}>
        <span className={styles.label}>Street</span>
        <input
          type="text"
          className={styles.input}
          value={value.street}
          onChange={(e) => set('street', e.target.value)}
        />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>City</span>
          <input
            type="text"
            className={styles.input}
            value={value.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>State</span>
          <input
            type="text"
            className={styles.input}
            value={value.state}
            onChange={(e) => set('state', e.target.value)}
            maxLength={2}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>ZIP</span>
          <input
            type="text"
            className={styles.input}
            value={value.zip}
            onChange={(e) => set('zip', e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
