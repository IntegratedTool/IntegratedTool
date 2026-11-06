import { useI18n, type Lang } from '../i18n';

const OPTIONS: { lang: Lang; label: string; htmlLang: string }[] = [
  { lang: 'ta', label: 'தமிழ்', htmlLang: 'ta' },
  { lang: 'en', label: 'English', htmlLang: 'en' },
];

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          lang={o.htmlLang}
          aria-pressed={lang === o.lang}
          onClick={() => setLang(o.lang)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
