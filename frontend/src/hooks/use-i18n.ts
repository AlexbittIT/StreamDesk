import { useState, useEffect } from 'react';
import { i18n, type Language } from '@/lib/i18n';

export function useI18n() {
  const [language, setLanguage] = useState<Language>(i18n.getLanguage());

  useEffect(() => {
    const handleLanguageChange = () => {
      setLanguage(i18n.getLanguage());
    };

    // Слушаем изменения языка
    window.addEventListener('language-change', handleLanguageChange);
    return () => window.removeEventListener('language-change', handleLanguageChange);
  }, []);

  const changeLanguage = (lang: Language) => {
    i18n.setLanguage(lang);
    setLanguage(lang);
    window.dispatchEvent(new Event('language-change'));
  };

  const t = (key: string, params?: Record<string, string | number>) => {
    return i18n.t(key, params);
  };

  return {
    language,
    setLanguage: changeLanguage,
    t,
  };
}

