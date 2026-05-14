import type { ReactNode } from 'react';
import logoSrc from '../../../assets/images/airtightfixed.png';
import styles from './sheet.module.css';

// Shared brand atoms used by every printable Airtight template
// (invoice + the four reports). Strict brand fidelity: change a font
// or a color here and every doc updates. Do not fork the sheet, the
// header strip, the parties block, or the footer per template —
// extend with new atoms instead.

export interface MetaItem {
  label: string;
  value: string | number;
}

export interface Party {
  /** Primary line in bold (business name when present, else person). */
  primary: string;
  /** Optional secondary line under the primary (e.g. contact when biz also present). */
  secondary?: string | null;
  /** Address lines, rendered as plain. */
  lines?: (string | null | undefined)[];
  /** Muted contact lines (phone, email) below the address. */
  muted?: (string | null | undefined)[];
}

const compactLines = (lines?: (string | null | undefined)[]) =>
  (lines ?? []).filter((l): l is string => !!l && l.trim().length > 0);

/** Top-level page wrapper — paper-cream sheet, letter-sized, flex column. */
export function BrandSheet({ children }: { children: ReactNode }) {
  return <div className={styles.sheet}>{children}</div>;
}

/** Slim header strip with logo left, doc title + meta block right. */
export function BrandHeader({
  title,
  meta = [],
  titleSize = 'lg',
}: {
  title: string;
  meta?: MetaItem[];
  /** 'lg' = 32pt (default, like the invoice). 'sm' = 26pt for narrower titles. */
  titleSize?: 'lg' | 'sm';
}) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img
          src={logoSrc}
          alt="Airtight Storage Systems"
          className={styles.logo}
        />
      </div>
      <div className={styles.docMeta}>
        <div
          className={`${styles.docTitle} ${
            titleSize === 'sm' ? styles.docTitleSm : ''
          }`}
        >
          {title}
        </div>
        {meta.length > 0 && (
          <dl className={styles.metaList}>
            {meta.map((m, i) => (
              <div key={i} className={styles.metaRow}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </header>
  );
}

/** Horizontal rule between header and body. */
export function Divider() {
  return <hr className={styles.divider} />;
}

/** FROM / TO parties block with an Archivo-Black connector word between. */
export function PartiesBlock({
  from,
  to,
  connector = 'To',
}: {
  from: Party;
  to: Party;
  connector?: string;
}) {
  return (
    <section className={styles.parties}>
      <PartyDisplay party={from} />
      <div className={styles.connector}>{connector}</div>
      <PartyDisplay party={to} />
    </section>
  );
}

function PartyDisplay({ party }: { party: Party }) {
  const addressLines = compactLines(party.lines);
  const mutedLines = compactLines(party.muted);
  return (
    <div className={styles.partyBlock}>
      <div className={styles.partyName}>{party.primary}</div>
      {party.secondary && (
        <div className={styles.partyLineMuted}>{party.secondary}</div>
      )}
      {addressLines.map((line, i) => (
        <div key={`a${i}`} className={styles.partyLine}>
          {line}
        </div>
      ))}
      {mutedLines.map((line, i) => (
        <div key={`m${i}`} className={styles.partyLineMuted}>
          {line}
        </div>
      ))}
    </div>
  );
}

/** Inline label/value banner — used for "Deliver to: X" and similar. */
export function Banner({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={styles.banner}>
      <span className={styles.bannerLabel}>{label}</span>
      <span className={styles.bannerValue}>{value}</span>
    </div>
  );
}

/** Bottom address footer strip shown on every printable doc. */
export function DocFooter({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerAddr}>
        {left ?? '41 Wilson Avenue · Manalapan, NJ 07726'}
      </div>
      <div className={styles.footerAddr}>
        {right ?? 'airtightshippingcontainer.com'}
      </div>
    </footer>
  );
}

/** Section heading for body subsections (e.g. "Inbound", "Outbound", "Sales"). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.sectionTitle}>{children}</h2>;
}

export { styles as brandStyles };

/** The standard "Airtight Storage Systems Inc" sender party — used by
 *  every customer-facing doc. Reports that aren't sent to a customer
 *  (P&L, I/O) may omit the parties block entirely. */
export const AIRTIGHT_PARTY: Party = {
  primary: 'Airtight Storage Systems Inc',
  lines: ['41 Wilson Avenue', 'Manalapan, NJ 07726'],
  muted: ['732-792-8111', 'michelle@airtightstorage.com'],
};
