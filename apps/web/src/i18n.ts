import { coreMessages, pickLocale } from '@racket-club/i18n';
import i18n from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'rc.locale';

function savedLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function initI18n(defaultLocale: 'en' | 'vi') {
  const lng = pickLocale(savedLocale() ?? navigator.language, defaultLocale);
  return i18n
    .use(ICU)
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      resources: {
        en: { core: coreMessages.en },
        vi: { core: coreMessages.vi },
      },
      defaultNS: 'core',
      interpolation: { escapeValue: false },
    });
}

export function setLocale(lng: 'en' | 'vi') {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // storage unavailable (private mode); the choice lasts for this visit only
  }
  document.documentElement.lang = lng;
  return i18n.changeLanguage(lng);
}
