import { useRef } from 'react';
import { APILoader, PlacePicker } from '@googlemaps/extended-component-library/react';
import type { PlacePicker as PlacePickerElement } from '@googlemaps/extended-component-library/place_picker.js';
import styles from './AddressFields.module.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined;

interface PlaceAddressComponent {
  types?: string[];
  longText?: string | null;
  shortText?: string | null;
}

interface SelectedPlace {
  addressComponents?: PlaceAddressComponent[] | null;
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

function placeToAddress(place: SelectedPlace): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const components = place.addressComponents ?? [];
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
  const pickerRef = useRef<PlacePickerElement | null>(null);

  const set = <K extends keyof AddressValue>(key: K, v: AddressValue[K]) =>
    onChange({ ...value, [key]: v });

  const handlePlaceChange = () => {
    const place = pickerRef.current?.value as SelectedPlace | null | undefined;
    if (!place) return;
    const { street, city, state, zip } = placeToAddress(place);
    onChange({
      ...value,
      street: street || value.street,
      city: city || value.city,
      state: state || value.state,
      zip: zip || value.zip,
    });
  };

  return (
    <div className={styles.wrap}>
      {GOOGLE_MAPS_API_KEY && (
        <label className={styles.field}>
          <span className={styles.label}>Search address</span>
          <APILoader apiKey={GOOGLE_MAPS_API_KEY} />
          <PlacePicker
            ref={pickerRef}
            className={styles.placePicker}
            type="address"
            country={['us']}
            placeholder="Start typing an address…"
            onPlaceChange={handlePlaceChange}
          />
        </label>
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
