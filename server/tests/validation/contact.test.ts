import { describe, it, expect } from 'vitest';
import { createContactSchema } from '../../validation/contact.js';

describe('createContactSchema', () => {
  it('accepts a minimal valid contact', () => {
    const result = createContactSchema.safeParse({
      customer: { contact_name: 'Jane Doe' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a fully populated contact', () => {
    const result = createContactSchema.safeParse({
      customer: {
        contact_name: 'Jane Doe',
        contact_email: 'jane@example.com',
        contact_phone: '555-555-1212',
        contact_address: '1 Main St, Manalapan, NJ 07726',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing contact_name', () => {
    const result = createContactSchema.safeParse({ customer: {} });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = createContactSchema.safeParse({
      customer: { contact_name: 'Jane', contact_email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a contact_name over 25 chars', () => {
    const result = createContactSchema.safeParse({
      customer: { contact_name: 'x'.repeat(26) },
    });
    expect(result.success).toBe(false);
  });

  it('trims whitespace from contact_name', () => {
    const result = createContactSchema.safeParse({
      customer: { contact_name: '  Jane Doe  ' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer.contact_name).toBe('Jane Doe');
    }
  });
});
