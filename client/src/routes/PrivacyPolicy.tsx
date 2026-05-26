import styles from './PrivacyPolicy.module.css';

// Public, unauthenticated privacy policy page. Scope is intentionally
// narrow — what we collect and do with customer + driver contact info
// in support of the SMS + email pipeline. Published primarily so the
// A2P 10DLC campaign reviewer can verify a policy exists at a URL on
// the registered domain.
//
// If the policy text changes, bump PRIVACY_POLICY_VERSION below so
// the footer reflects the new effective date.

const PRIVACY_POLICY_VERSION = 'v1-2026-05-25';

interface Section {
  heading: string;
  body: React.ReactNode;
}

const SECTIONS: readonly Section[] = [
  {
    heading: 'Who we are',
    body: (
      <>
        Airtight Storage Systems Inc, operating the storage container
        yard at 41 Wilson Avenue, Manalapan, NJ 07726, and the website
        airtightshippingcontainer.com. Throughout this policy "we",
        "us", and "Airtight" mean Airtight Storage Systems Inc.
      </>
    ),
  },
  {
    heading: 'What this policy covers',
    body: (
      <>
        How we collect, use, store, and protect contact information that
        customers and drivers provide in the course of buying, leasing,
        or picking up a storage container from us. It does not cover any
        third-party websites.
      </>
    ),
  },
  {
    heading: 'Information we collect',
    body: (
      <>
        <strong>From customers:</strong> name, business name, billing
        address, delivery address, email address, and phone number. We
        record sale and rental activity tied to your account so we can
        invoice you and answer questions about prior deliveries.
        <br />
        <br />
        <strong>From drivers at pickup:</strong> driver name and phone
        number (provided to us verbally at the gate), and optionally a
        driver email. We collect this only when you are picking up a
        container and only to send you the delivery receipt for that
        pickup.
      </>
    ),
  },
  {
    heading: 'How we use that information',
    body: (
      <>
        Customer contact information is used to fulfill sales and rental
        orders, invoice you, follow up on storage handling items, and
        respond to your questions. Driver contact information is used
        only to deliver the receipt for the container being picked up
        — by email, SMS, or both, at your direction at pickup. We do
        not use any of this information for marketing.
      </>
    ),
  },
  {
    heading: 'SMS messages',
    body: (
      <>
        SMS messages are sent only after our yard operator has read you
        the SMS disclosure at handoff and you have given verbal consent.
        Each message is transactional: one SMS per pickup, containing a
        link to your delivery receipt. Message and data rates may apply.
        Reply STOP to opt out, HELP for help. Full SMS terms at{' '}
        <a href="/sms-terms">/sms-terms</a>.
      </>
    ),
  },
  {
    heading: 'How we share information',
    body: (
      <>
        We do not sell or rent your information to anyone. We share it
        only with service providers we rely on to deliver our service —
        for example, Twilio (to send SMS), Resend (to send email), and
        Amazon Web Services (to store invoice PDFs and intake photos).
        Each of these providers is contractually bound to handle the
        information only on our behalf.
      </>
    ),
  },
  {
    heading: 'How long we keep it',
    body: (
      <>
        Customer and invoice records are retained for as long as your
        account is active and for a period afterward to satisfy
        accounting and tax obligations. Driver contact records and
        delivery receipts are retained for the life of the related
        invoice. SMS receipt links expire 30 days after issue.
      </>
    ),
  },
  {
    heading: 'How we protect it',
    body: (
      <>
        Access to customer records is restricted to authenticated
        Airtight staff. Passwords are stored hashed and salted. PDFs and photos in
        cloud storage are served only via short-lived signed links.
      </>
    ),
  },
  {
    heading: 'Your choices',
    body: (
      <>
        You can ask us to update or delete the contact information we
        hold about you, opt out of SMS at any time by replying STOP, or
        ask us not to send delivery receipts to you in the future.
        Contact us at the address below.
      </>
    ),
  },
  {
    heading: 'Children',
    body: (
      <>
        Our services are not intended for and not marketed to anyone
        under 13. We do not knowingly collect information from children.
      </>
    ),
  },
  {
    heading: 'Changes to this policy',
    body: (
      <>
        We may update this policy from time to time. Material changes
        will be reflected here with an updated effective version.
      </>
    ),
  },
  {
    heading: 'Contact',
    body: (
      <>
        Airtight Storage Systems Inc, 41 Wilson Avenue, Manalapan, NJ
        07726 ·{' '}
        <a href="mailto:michelle@airtightstorage.com">
          michelle@airtightstorage.com
        </a>{' '}
        · 732-792-8111
      </>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <h1 className={styles.title}>Privacy policy</h1>
          <p className={styles.subtitle}>
            Airtight Storage Systems Inc · airtightshippingcontainer.com
          </p>
        </header>

        <div className={styles.body}>
          {SECTIONS.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.sectionHeading}>{section.heading}</h2>
              <p className={styles.sectionBody}>{section.body}</p>
            </section>
          ))}
        </div>

        <footer className={styles.foot}>
          <p className={styles.version}>
            Effective version: {PRIVACY_POLICY_VERSION}
          </p>
        </footer>
      </div>
    </div>
  );
}
