import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { APILoader, PlacePicker } from '@googlemaps/extended-component-library/react';
import type { PlacePicker as PlacePickerElement } from '@googlemaps/extended-component-library/place_picker.js';
import { Button } from '../ui';
import styles from './ClientForm.module.css';

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

export interface Client {
  id?: number;
  client_name: string;
  business_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  default_in_fee?: number | string | null;
  default_out_fee?: number | string | null;
  default_daily_rate?: number | string | null;
}

interface Props {
  initial?: Client | null;
  onSubmit: (c: Client) => Promise<void> | void;
  onCancel: () => void;
}

const empty: Client = {
  client_name: '',
  business_name: '',
  contact_email: '',
  contact_phone: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  default_in_fee: 65,
  default_out_fee: 65,
  default_daily_rate: 1,
};

export function ClientForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<Client>(initial ?? empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<PlacePickerElement | null>(null);

  useEffect(() => {
    setForm(initial ?? empty);
  }, [initial]);

  const update =
    <K extends keyof Client>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handlePlaceChange = () => {
    const place = pickerRef.current?.value as SelectedPlace | null | undefined;
    if (!place) return;
    const { street, city, state, zip } = placeToAddress(place);
    setForm((f) => ({
      ...f,
      street: street || f.street,
      city: city || f.city,
      state: state || f.state,
      zip: zip || f.zip,
    }));
  };

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.client_name?.trim()) {
      setError('Client name is required');
      return;
    }
    if (form.contact_email && !/^\S+@\S+\.\S+$/.test(form.contact_email)) {
      setError('Email looks invalid');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handle}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Client name *</span>
          <input
            type="text"
            value={form.client_name}
            onChange={update('client_name')}
            autoFocus
            required
          />
        </label>
        <label className={styles.field}>
          <span>Business name</span>
          <input
            type="text"
            value={form.business_name ?? ''}
            onChange={update('business_name')}
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Email</span>
          <input
            type="email"
            value={form.contact_email ?? ''}
            onChange={update('contact_email')}
          />
        </label>
        <label className={styles.field}>
          <span>Phone</span>
          <input
            type="tel"
            value={form.contact_phone ?? ''}
            onChange={update('contact_phone')}
          />
        </label>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Address</legend>
        {GOOGLE_MAPS_API_KEY && (
          <label className={styles.field}>
            <span>Search address</span>
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
        <label className={styles.field}>
          <span>Street</span>
          <input
            type="text"
            value={form.street ?? ''}
            onChange={update('street')}
          />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>City</span>
            <input
              type="text"
              value={form.city ?? ''}
              onChange={update('city')}
            />
          </label>
          <label className={styles.fieldSmall}>
            <span>State</span>
            <input
              type="text"
              value={form.state ?? ''}
              onChange={update('state')}
              maxLength={2}
            />
          </label>
          <label className={styles.fieldSmall}>
            <span>ZIP</span>
            <input
              type="text"
              value={form.zip ?? ''}
              onChange={update('zip')}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Storage &amp; Handling rate defaults</legend>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>In fee ($)</span>
            <input
              type="number"
              step="0.01"
              value={form.default_in_fee ?? ''}
              onChange={update('default_in_fee')}
            />
          </label>
          <label className={styles.field}>
            <span>Out fee ($)</span>
            <input
              type="number"
              step="0.01"
              value={form.default_out_fee ?? ''}
              onChange={update('default_out_fee')}
            />
          </label>
          <label className={styles.field}>
            <span>Daily rate ($)</span>
            <input
              type="number"
              step="0.01"
              value={form.default_daily_rate ?? ''}
              onChange={update('default_daily_rate')}
            />
          </label>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : initial?.id ? 'Save changes' : 'Create client'}
        </Button>
      </div>
    </form>
  );
}
