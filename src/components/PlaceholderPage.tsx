import { useI18n, type TKey } from '../i18n';
import { useSession } from '../session';
import { AccessibleNotification } from './AccessibleNotification';
import { PageTitle } from './PageTitle';

export function PlaceholderPage({ kind }: { kind: 'dashboard' | 'mis' | 'profile' }) {
  const { t } = useI18n();
  const { user, navigate } = useSession();
  const title: Record<typeof kind, TKey> = { dashboard: 'nav.dashboard', mis: 'nav.mis', profile: 'nav.profile' };
  return (
    <section aria-labelledby="page-title">
      <PageTitle>{t(title[kind])}</PageTitle>
      {kind === 'dashboard' ? (
        <>
          <p>{t('ph.dashboard.welcome', { name: user.displayName })}</p>
          <AccessibleNotification kind="info">{t('ph.dashboard.body')}</AccessibleNotification>
          <div className="actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--primary" onClick={() => navigate({ name: 'raise' })}>{t('nav.raise')}</button>
            <button type="button" className="btn btn--secondary" onClick={() => navigate({ name: 'list', list: 'mine' })}>{t('nav.mine')}</button>
          </div>
        </>
      ) : (
        <AccessibleNotification kind="info">{t('ph.pending')}</AccessibleNotification>
      )}
    </section>
  );
}
