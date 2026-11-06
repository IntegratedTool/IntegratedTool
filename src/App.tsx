import { useState } from 'react';
import { siteConfig } from './config/site';
import { DepartmentFooter } from './components/DepartmentFooter';
import { DepartmentHeader } from './components/DepartmentHeader';
import { HelpBot } from './components/HelpBot';
import { HelpContactPanel } from './components/HelpContactPanel';
import { LoginCard } from './components/LoginCard';
import { PublicAnnouncementPanel } from './components/PublicAnnouncementPanel';
import { AppShell } from './components/AppShell';
import { useI18n } from './i18n';
import type { AuthResult } from './services';

export function App() {
  const { t } = useI18n();
  const [user, setUser] = useState<AuthResult | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <DepartmentHeader />
      {siteConfig.useMock && (
        <div className="proto-banner" role="note">
          {t('proto.banner')}
        </div>
      )}
      {user ? (
        <main id="main" className="main-app" tabIndex={-1}>
          <div className="page">
            <AppShell user={user} onEnd={() => setUser(null)} />
          </div>
        </main>
      ) : (
        <main id="main" className="main-bg" tabIndex={-1}>
          <div className="page">
            <div className="layout">
              <LoginCard adminMode={adminMode} onExitAdmin={() => setAdminMode(false)} onSignedIn={(r) => { window.location.hash = '#/dashboard'; setAdminMode(false); setUser(r); }} />
              <PublicAnnouncementPanel />
              <HelpContactPanel />
            </div>
          </div>
        </main>
      )}
      <HelpBot />
      <DepartmentFooter onAdminLogin={user ? undefined : () => { setAdminMode(true); window.scrollTo({ top: 0 }); }} />
    </>
  );
}
