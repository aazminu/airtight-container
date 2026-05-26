// Twilio client + SMS send helper for driver-receipt messages.
//
// Wraps the SDK so the rest of the server can call sendSms() without
// branching on whether Twilio creds are set. When env vars are absent
// (local dev without secrets, CI), isSmsConfigured() returns false and
// sendSms() throws a "Twilio not configured" error — the routes
// translate that into a 503 so the UI can show a clear message.
//
// Sender selection: prefer the Messaging Service SID (Twilio's
// recommended A2P 10DLC path — handles failover + sender pool +
// short-code fallback). Fall back to a hard-coded From number if a
// service SID isn't set.

import twilio from 'twilio';
import type { Twilio } from 'twilio';

let _cached: { client: Twilio } | { client: null } | undefined;

function load(): Twilio | null {
  if (_cached !== undefined) return _cached.client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    _cached = { client: null };
    return null;
  }
  _cached = { client: twilio(sid, token) };
  return _cached.client;
}

// Test-only hatch: reset the module-cached client so tests can flip
// env between cases without restarting the process.
export function _resetForTests() {
  _cached = undefined;
}

export function isSmsConfigured(): boolean {
  const client = load();
  if (!client) return false;
  return (
    !!process.env.TWILIO_MESSAGING_SERVICE_SID ||
    !!process.env.TWILIO_FROM_NUMBER
  );
}

export interface SendSmsResult {
  sid: string;
  to: string;
  status: string;
}

export async function sendSms(args: {
  to: string;
  body: string;
}): Promise<SendSmsResult> {
  const client = load();
  if (!client) throw new Error('Twilio not configured');

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!messagingServiceSid && !from) {
    throw new Error(
      'Twilio sender not set — provide TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER',
    );
  }

  const result = await client.messages.create({
    to: args.to,
    body: args.body,
    ...(messagingServiceSid
      ? { messagingServiceSid }
      : { from: from! }),
  });
  return { sid: result.sid, to: result.to, status: result.status };
}

// Normalize a phone string to a best-effort E.164 form. We don't have
// a libphonenumber dependency and don't need full parsing — Twilio
// itself validates and rejects malformed numbers. This just handles the
// common operator-input forms: "(732) 861-4011", "732-861-4011",
// "7328614011", "+1 732 861 4011". Anything that doesn't reduce to
// 10 digits (US) or already-E.164 gets returned as-is for Twilio to
// reject with a clear error.
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/\s+/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed;
}
