import type { BadgeProps } from '../ui';
import type { InvoiceStatus } from '../templates/invoice/types';

// Visual conventions for invoice lifecycle status. Both InvoicesGrid
// (tiles) and InvoiceDetail (header pill) read from here so the same
// status always looks the same wherever it's surfaced.

type BadgeTone = NonNullable<BadgeProps['tone']>;

const TONE_BY_STATUS: Record<InvoiceStatus, BadgeTone> = {
  draft: 'warning',
  awaiting: 'info',
  paid: 'success',
  delinquent: 'danger',
  cancelled: 'neutral',
};

const LABEL_BY_STATUS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  awaiting: 'Awaiting payment',
  paid: 'Paid',
  delinquent: 'Delinquent',
  cancelled: 'Cancelled',
};

export function statusBadgeTone(status: InvoiceStatus): BadgeTone {
  return TONE_BY_STATUS[status];
}

export function statusLabel(status: InvoiceStatus): string {
  return LABEL_BY_STATUS[status];
}

// Threshold past which an awaiting invoice picks up a visible "X days
// unpaid" warning. The status itself doesn't change — operator clicks
// remain the only way to flip to delinquent — but the warning prompts
// the operator to do so.
export const AWAITING_OVERDUE_DAYS = 30;

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  const ms = Date.now() - then;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function isAwaitingPastDue(
  status: InvoiceStatus,
  invoiceDate: string,
): boolean {
  return status === 'awaiting' && daysSince(invoiceDate) >= AWAITING_OVERDUE_DAYS;
}
