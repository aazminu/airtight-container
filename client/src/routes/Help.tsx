import { useTranslation } from 'react-i18next';
import styles from './Help.module.css';

// Help page placeholder. Content is authored by the user (per
// docs/PLAN.md §8 open follow-ups) and dropped into the i18n bundle
// when ready. For now this surfaces a minimal getting-help message so
// the /help link from the navbar doesn't 404.

export default function Help() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('help.title')}</h1>
      <p className={styles.lede}>{t('help.lede')}</p>
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
