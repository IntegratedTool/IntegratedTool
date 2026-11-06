import { siteConfig } from '../config/site';
import { useI18n } from '../i18n';

/** Contact details come only from siteConfig; nothing is invented. Missing values read "To be notified". */
export function HelpContactPanel() {
  const { t } = useI18n();
  const c = siteConfig.contact;
  const pending = <span className="pending">{t('help.pending')}</span>;

  return (
    <section className="card help" aria-labelledby="help-title">
      <h2 id="help-title">{t('help.title')}</h2>
      <dl>
        <div>
          <dt>{t('help.contact')}</dt>
          <dd>
            {t('help.email')}: {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : pending}
          </dd>
        </div>
        <div>
          <dt>{t('help.faq')}</dt>
          <dd>
            {c.faqUrl ? (
              <a href={c.faqUrl} target="_blank" rel="noopener noreferrer">
                {t('help.open')}
                <span className="visually-hidden">
                  : {t('help.faq')} ({t('common.external')})
                </span>
              </a>
            ) : (
              <span className="pending">{t('help.pendingLink')}</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
