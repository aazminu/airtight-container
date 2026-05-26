import {
  SMS_CONSENT_SECTIONS,
  SMS_CONSENT_VERSION,
} from '../lib/smsConsent';
import styles from './SmsTerms.module.css';

// Public, unauthenticated page describing how Airtight collects SMS
// consent. Linked from the Send-to-Driver dialog and published as the
// "messaging policy URL" on the A2P 10DLC campaign so Twilio's
// reviewers can verify the consent practice without logging in.
//
// Content is sourced from client/src/lib/smsConsent.ts so the
// in-product disclosure and the public page can never drift.

export default function SmsTerms() {
  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <h1 className={styles.title}>SMS messaging policy</h1>
          <p className={styles.subtitle}>
            Airtight Storage Systems Inc · airtightshippingcontainer.com
          </p>
        </header>

        <section className={styles.intro}>
          <p>
            Airtight Storage Systems Inc (operating
            airtightshippingcontainer.com) sends one-time transactional
            SMS messages to drivers picking up storage containers from
            our yard in Manalapan, NJ. The message contains a link to a
            PDF of the driver's delivery sheet.
          </p>
          <p>
            <strong>How consent is collected:</strong> at container
            handoff, our yard operator reads the disclosure below to the
            driver, captures the driver's verbal consent, and records
            the attestation in our system before any message is
            dispatched. We do not send marketing messages and we do not
            share phone numbers with third parties.
          </p>
        </section>

        <section className={styles.terms} aria-label="SMS disclosure">
          {SMS_CONSENT_SECTIONS.map((section) => (
            <div key={section.heading} className={styles.termsItem}>
              <h2 className={styles.termsHeading}>{section.heading}</h2>
              <p className={styles.termsBody}>{section.body}</p>
            </div>
          ))}
        </section>

        <footer className={styles.foot}>
          <p>
            Questions about a message you received, or to opt out of
            future delivery-receipt messages, contact{' '}
            <a href="mailto:michelle@airtightstorage.com">
              michelle@airtightstorage.com
            </a>
            . You may also reply STOP to any message to opt out.
          </p>
          <p>
            See our <a href="/privacy-policy">privacy policy</a> for how
            we collect, use, and protect contact information.
          </p>
          <p className={styles.version}>
            Disclosure version: {SMS_CONSENT_VERSION}
          </p>
        </footer>
      </div>
    </div>
  );
}
