// Bilingual FR/EN for the mobile app.
//
// Opens in the phone's own language, with a manual toggle that persists. The
// API stays language-agnostic: categories arrive as {en, fr} and everything
// else as enum keys, so switching language refetches nothing (§4.1).
//
// A deliberately tiny implementation rather than i18next — this app has ~70
// strings and one plural, and a 40-line module beats a dependency for that.

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fr } from './fr.js';
import { en } from './en.js';

const BUNDLES = { fr, en };
const STORAGE_KEY = 'naftal.lang';

const I18nContext = createContext(null);

function deviceLanguage() {
  try {
    const tag = getLocales()?.[0]?.languageCode;
    return tag === 'en' ? 'en' : 'fr'; // Algeria defaults to French
  } catch {
    return 'fr';
  }
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(deviceLanguage);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => { if (saved === 'fr' || saved === 'en') setLang(saved); })
      .catch(() => {});
  }, []);

  const change = useCallback((next) => {
    setLang(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => {
    /** t('key', { name: 'x' }) — falls back to French, then to the key itself. */
    const t = (key, vars) => {
      let s = BUNDLES[lang][key] ?? BUNDLES.fr[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
      return s;
    };

    /** Categories arrive bilingual from the API; pick the active side. */
    const name = (bilingual) =>
      typeof bilingual === 'string' ? bilingual : (bilingual?.[lang] ?? bilingual?.fr ?? '');

    /** Prices: 13500 -> "13 500 DA". Narrow no-break space, as French uses. */
    const money = (amount) =>
      `${Number(amount ?? 0).toLocaleString(lang === 'fr' ? 'fr-DZ' : 'en-GB').replace(/,/g, ' ')} DA`;

    return { lang, setLang: change, t, name, money };
  }, [lang, change]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Localise an API failure from its code, never from its English message. */
export function useApiErrorText() {
  const { t } = useI18n();
  return (err) => t(`err.${err?.code ?? 'UNKNOWN'}`);
}
