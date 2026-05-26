import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

// i18next configuration.
//
// Scope (per docs/PLAN.md §7 Phase 6): only the yard-facing flows are
// localized — Intake, YardView, Add A Box, Help, plus the navbar items
// the yard worker sees. Admin flows stay English-only.
//
// All translation keys live under a single `yard` namespace so the
// admin bundle stays empty; if we ever need admin-side strings we
// can split into more namespaces.

export const LANGUAGE_STORAGE_KEY = 'app.lang';
export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { yard: en },
      es: { yard: es },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: ['yard'],
    defaultNS: 'yard',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export function setLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
}

export default i18n;
