// Single source of truth for the SMS-consent disclosure shown in the
// Send-to-Driver dialog and the public /sms-terms page. Mirrors the
// version string in server/lib/sms-consent.ts — they must match or
// the server will reject the send.

export const SMS_CONSENT_VERSION = 'v1-2026-05-25';

export interface SmsConsentSection {
  heading: string;
  body: string;
}

export const SMS_CONSENT_SECTIONS: readonly SmsConsentSection[] = [
  {
    heading: "What you'll receive",
    body:
      'A one-time SMS containing a link to the PDF of your delivery sheet for the container you are picking up. This is a transactional message tied to your specific pickup, sent by Airtight Storage Systems Inc (operating airtightshippingcontainer.com).',
  },
  {
    heading: 'Message frequency',
    body:
      'Up to one SMS per container pickup. We do not send marketing or promotional messages.',
  },
  {
    heading: 'Carrier rates',
    body: 'Message and data rates may apply.',
  },
  {
    heading: 'How to opt out',
    body:
      'Reply STOP to opt out of future messages from this number. Reply HELP for help.',
  },
  {
    heading: 'Privacy',
    body:
      'We use your phone number only to send the delivery receipt link. We do not share your number with third parties for marketing.',
  },
  {
    heading: 'Contact',
    body:
      'Airtight Storage Systems Inc · michelle@airtightstorage.com · airtightshippingcontainer.com',
  },
] as const;
