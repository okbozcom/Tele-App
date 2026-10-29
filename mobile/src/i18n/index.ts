import { useState, useEffect } from 'react';
import { en, TranslationKey } from './en';
import { ta } from './ta';
import { hi } from './hi';
import { storage } from '../utils/storage';

export type SupportedLanguage = 'en' | 'ta' | 'hi';

const dictionaries: Record<SupportedLanguage, Record<TranslationKey, string>> = {
  en,
  ta,
  hi,
};

let currentLanguage: SupportedLanguage = 'en';
const listeners = new Set<(lang: SupportedLanguage) => void>();

// Initialize language from local storage
storage.getItem('tele_crm_language').then((stored) => {
  if (stored === 'en' || stored === 'ta' || stored === 'hi') {
    currentLanguage = stored;
    listeners.forEach((listener) => listener(currentLanguage));
  }
});

export const getAppLanguage = (): SupportedLanguage => currentLanguage;

export const setAppLanguage = async (lang: SupportedLanguage): Promise<void> => {
  currentLanguage = lang;
  await storage.setItem('tele_crm_language', lang);
  listeners.forEach((listener) => listener(currentLanguage));
};

export const t = (key: TranslationKey, overrideLang?: SupportedLanguage): string => {
  const lang = overrideLang || currentLanguage;
  const dict = dictionaries[lang] || dictionaries.en;
  return dict[key] || en[key] || key;
};

export const useTranslation = () => {
  const [lang, setLang] = useState<SupportedLanguage>(currentLanguage);

  useEffect(() => {
    const handleLangChange = (newLang: SupportedLanguage) => {
      setLang(newLang);
    };
    listeners.add(handleLangChange);
    return () => {
      listeners.delete(handleLangChange);
    };
  }, []);

  return {
    t: (key: TranslationKey) => t(key, lang),
    language: lang,
    setLanguage: setAppLanguage,
  };
};

export { TranslationKey } from './en';
