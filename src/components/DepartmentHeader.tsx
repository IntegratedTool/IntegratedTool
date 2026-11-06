import { useState } from 'react';
import { siteConfig } from '../config/site';
import { useI18n } from '../i18n';
import { en } from '../i18n/en';
import { ta } from '../i18n/ta';
import { AccessibilityMenu } from './AccessibilityMenu';
import { HeaderClock } from './LoginClock';
import { LanguageSwitcher } from './LanguageSwitcher';

/**
 * Official emblem slot. The emblem file must come from the department (see README);
 * it is never invented here. If the file is absent, a clearly labelled placeholder shows instead.
 */
function Emblem() {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="emblem emblem--placeholder" role="img" aria-label={t('emblem.missing')}>
        <span aria-hidden="true">Emblem</span>
      </div>
    );
  }
  return (
    <div className="emblem">
      <img src={siteConfig.emblemSrc} alt={t('emblem.alt')} onError={() => setFailed(true)} />
    </div>
  );
}

/** Both languages are always shown side by side, Tamil first. The page language only changes the rest of the screen. */
export function DepartmentHeader() {
  const block = (lang: 'ta' | 'en', d: typeof en | typeof ta) => (
    <div className={`brand__col brand__col--${lang}`} lang={lang}>
      <p className="brand__gov">{d.gov}</p>
      <p className="brand__dept">{d.dept}</p>
      <p className="brand__portal">{d.portal}</p>
    </div>
  );
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Emblem />
        <h1 className="brand">
          {block('ta', ta)}
          <span className="brand__rule" aria-hidden="true" />
          {block('en', en)}
        </h1>
        <div className="header-tools">
          <div className="header-tools__row">
            <LanguageSwitcher />
            <AccessibilityMenu />
          </div>
          <HeaderClock />
        </div>
      </div>
    </header>
  );
}
