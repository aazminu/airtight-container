import { useTranslation } from 'react-i18next';
import styles from './Help.module.css';

export default function Help() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('help.title')}</h1>
      <p className={styles.lede}>
        A field guide to what each screen is for and when you reach for it.
        Skim once, then come back when something doesn&rsquo;t look right.
      </p>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Intake</h2>
        <p>
          Start every box at <strong>/intake</strong>. Pick{' '}
          <strong>Sales</strong> (going on the lot to sell) or{' '}
          <strong>Storage</strong> (a client is dropping it for S&amp;H).
          Photograph the doors first &mdash; OCR reads the unit number and
          size off the placard and pre-fills the form; confirm or correct on
          the next screen. If the unit number matches a pre-loaded release,
          the release auto-attaches. Submitted boxes land in{' '}
          <strong>Pending</strong> and wait for an admin to fill in price,
          in/out fees, and daily rate before they go live.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Yard view</h2>
        <p>
          Read-only snapshot of what&rsquo;s on the lot right now: sales
          containers grouped by size and state, the currently-valid release
          numbers, and the S&amp;H client roster with each client&rsquo;s
          boxes. Use it for &ldquo;do we have a 40HC?&rdquo; or &ldquo;is
          this release still good?&rdquo; questions at the gate.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Inventory</h2>
        <p>
          Operational list for sales containers. Three tabs:{' '}
          <strong>Available</strong> (on the lot, ready to sell &mdash;
          includes held units), <strong>Pending</strong> (waiting on admin
          audit), and <strong>Sold</strong> (gone or on the way out). Search
          across unit&nbsp;#, sale company, release, and notes. Clicking a
          row opens the edit modal; a Pending row jumps you straight into
          the audit screen.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Invoices</h2>
        <p>
          Sales invoices. The list shows everything; click one for the full
          preview, line items, and per-invoice actions (regenerate PDF,
          email the customer, mark paid). <strong>New invoice</strong> runs
          the create flow: pick the customer, pick one or more containers,
          set price + trucking + destination + modifications per box,
          preview, save. Saving generates the PDF; the email button sends it
          to the customer&rsquo;s address on file.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>S&amp;H invoices</h2>
        <p>
          Generated automatically at the start of each month for every
          active storage client. Each one lists in-fees, out-fees, and
          storage-day charges per box for the billing month. They land in{' '}
          <strong>Pending review</strong> &mdash; eyeball the numbers, then
          send to push the PDF to the client and move it to{' '}
          <strong>Sent</strong>. Mark <strong>Paid</strong> when payment
          lands.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Releases</h2>
        <p>
          Admin view for release-number quotas. Each release has a quota
          (containers we&rsquo;re allowed to ship under it) and a filled
          count. Two tabs: <strong>Active</strong> (quota not yet met) and{' '}
          <strong>Filled</strong>. Open a release to see the pre-loaded
          container list (used by intake auto-match) and the actual
          containers logged under it.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Reports</h2>
        <p>
          Generators for the documents the yard hands out or keeps on file.{' '}
          <strong>Delivery sheet</strong>: one-pager for the driver at
          outbound. <strong>In&nbsp;/&nbsp;Out</strong>: inbound and
          outbound activity for a date window, sales and S&amp;H combined.{' '}
          <strong>P&amp;L</strong>: revenue vs. cost across a period.{' '}
          <strong>S&amp;H statement</strong>: per-client billing roll-up.{' '}
          <strong>Release summary</strong>: every container logged under a
          single release.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Dashboard</h2>
        <p>
          Admin home. The <strong>P&amp;L panel</strong> sits at the top for
          at-a-glance revenue. The other tabs manage the dropdown presets
          used elsewhere in the app &mdash;{' '}
          <strong>Modification Presets</strong> (with default prices that
          auto-fill on invoices), <strong>Container Sizes</strong>, and{' '}
          <strong>Damage Types</strong> &mdash; plus{' '}
          <strong>Account Management</strong> for inviting employees and
          setting roles.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>Language</h2>
        <p>
          The <strong>EN&nbsp;/&nbsp;ES</strong> toggle in the navbar
          switches the yard-facing screens (Intake, Yard view) to Spanish.
          Admin screens stay in English.
        </p>
      </div>

      <div className={styles.contactCard}>
        <h2 className={styles.sectionTitle}>{t('help.contact_heading')}</h2>
        <p>
          <strong>Michelle</strong>
          <br />
          <a href="mailto:michelle@airtightstorage.com">
            michelle@airtightstorage.com
          </a>
        </p>
      </div>
    </div>
  );
}
