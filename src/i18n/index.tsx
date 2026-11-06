import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type TKey } from './en';
import { ta } from './ta';

export type Lang = 'en' | 'ta';
const dictionaries: Record<Lang, Record<TKey, string>> = { en, ta };
const STORAGE_KEY = 'ctd-helpdesk-lang';

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  /** BCP-47 locale used for dates/numbers */
  locale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY); // language preference only, not a secret
    if (saved === 'en' || saved === 'ta') return saved;
  } catch {
    /* storage unavailable: fall through */
  }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${dictionaries[lang].gov} | ${dictionaries[lang].portal} | ${dictionaries[lang].dept}`;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      locale: lang === 'ta' ? 'ta-IN' : 'en-IN',
      t: (key, vars) => {
        let s: string = dictionaries[lang][key] ?? en[key];
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export type { TKey };
