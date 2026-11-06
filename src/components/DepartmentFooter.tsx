import { siteConfig } from '../config/site';
import { useI18n } from '../i18n';

export function DepartmentFooter({ onAdminLogin }: { onAdminLogin?: () => void }) {
  const { t, locale } = useI18n();
  const updated = siteConfig.lastUpdated
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(siteConfig.lastUpdated))
    : null;

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav aria-label={t('footer.links')}>
          <ul>
            {siteConfig.footerLinks.map((l) => (
              <li key={l.labelKey}>
                {l.href ? (
                  <a href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                    {t(l.labelKey)}
                    {l.external && <span className="visually-hidden"> ({t('common.external')})</span>}
                  </a>
                ) : (
                  // Not yet approved: shown as text with an explanation, not as a dead link.
                  <span className="pending-link" title={t('footer.pending')}>
                    {t(l.labelKey)}
                    <span className="visually-hidden"> ({t('footer.pending')})</span>
                  </span>
                )}
              </li>
            ))}
            {onAdminLogin && (
              <li>
                <button type="button" className="footer-link-btn" onClick={onAdminLogin}>
                  {t('footer.admin')}
                </button>
              </li>
            )}
          </ul>
        </nav>
        <small>{t('footer.copyright')}</small>
        {updated && <small>{t('footer.lastUpdated', { date: updated })}</small>}
      </div>
    </footer>
  );
}
