import { describe, it, expect } from 'vitest';
import { createClientSchema } from '../../validation/client.js';

describe('createClientSchema', () => {
  it('accepts a minimal legacy-shaped contact', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane Doe' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a minimal new-shaped client', () => {
    const result = createClientSchema.safeParse({
      customer: { client_name: 'Acme LLC' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a fully populated legacy contact', () => {
    const result = createClientSchema.safeParse({
      customer: {
        contact_name: 'Jane Doe',
        contact_email: 'jane@example.com',
        contact_phone: '555-555-1212',
        contact_address: '1 Main St, Manalapan, NJ 07726',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a fully populated split-address client', () => {
    const result = createClientSchema.safeParse({
      customer: {
        client_name: 'Acme LLC',
        business_name: 'Acme Holdings',
        contact_email: 'sales@acme.example',
        contact_phone: '555-555-1212',
        street: '1 Main St',
        city: 'Manalapan',
        state: 'NJ',
        zip: '07726',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload with neither client_name nor contact_name', () => {
    const result = createClientSchema.safeParse({ customer: {} });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane', contact_email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
  });

  it('coerces an empty-string email to null instead of rejecting', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane', contact_email: '' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.contact_email).toBeNull();
    }
  });

  it('coerces blank optional text fields to null', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane', business_name: '   ', city: '' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.business_name).toBeNull();
      expect(result.data.customer.city).toBeNull();
    }
  });

  it('normalizes phone to canonical XXX-XXX-XXXX form', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane', contact_phone: '(555) 123-4567' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.contact_phone).toBe('555-123-4567');
    }
  });

  it('normalizes phone with an extension', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane', contact_phone: '(555) 123-4567 x1234' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.contact_phone).toBe('555-123-4567 EXT. 1234');
    }
  });

  it('coerces a blank phone to null', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: 'Jane', contact_phone: '' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.contact_phone).toBeNull();
    }
  });

  it('trims whitespace from contact_name', () => {
    const result = createClientSchema.safeParse({
      customer: { contact_name: '  Jane Doe  ' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.contact_name).toBe('Jane Doe');
    }
  });
});
