import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import translations from '../i18n/translations';

const LanguageContext = createContext(null);

const LANGUAGE_KEY = 'wf-language';

function getInitialLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch { /* ignore */ }
  return 'en';
}

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'es', label: 'Spanish' },
];

export function LanguageProvider({ children }) {
  const [language, setLang] = useState(getInitialLanguage);

  const setLanguage = useCallback((code) => {
    if (translations[code]) {
      setLang(code);
      try { localStorage.setItem(LANGUAGE_KEY, code); } catch { /* ignore */ }
    }
  }, []);

  const t = useCallback((key) => {
    return translations[language]?.[key] || translations.en[key] || key;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
