import { useState } from 'react';
import { useI18n } from '../i18n';
import type { AuthResult } from '../services';
import { AccessibleNotification } from './AccessibleNotification';
import { DealerLogin } from './DealerLogin';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';
import { OfficerLogin } from './OfficerLogin';
import { PasswordLoginForm } from './PasswordLoginForm';
import { RegistrationFlow } from './RegistrationFlow';
import { UserTypeSelector } from './UserTypeSelector';

type Role = 'officer' | 'dealer' | 'others';
type OthersMode = 'existing' | 'new';
type Banner = 'registered' | 'reset' | null;

export function LoginCard({ onSignedIn, adminMode, onExitAdmin }: { onSignedIn: (r: AuthResult) => void; adminMode: boolean; onExitAdmin: () => void }) {
  const { t } = useI18n();
  const [role, setRole] = useState<Role>('officer');
  const [othersMode, setOthersMode] = useState<OthersMode>('existing');
  const [forgot, setForgot] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const setSession = onSignedIn;

  const changeRole = (r: Role) => {
    setRole(r);
    setForgot(false);
    setBanner(null);
  };

  return (
    <section className="card login-card" aria-labelledby="login-title">
      <h2 id="login-title">{t('login.title')}</h2>

      {adminMode ? (
        <>
          <h3 className="admin-heading">{t('role.admin')}</h3>
          <PasswordLoginForm kind="admin" onSuccess={setSession} />
          <button type="button" className="link-btn admin-back" onClick={onExitAdmin}>
            ← {t('login.backToUsers')}
          </button>
        </>
      ) : (
      <>
      <UserTypeSelector<Role>
        columns={3}
        label={t('role.group')}
        idBase="role"
        value={role}
        onChange={changeRole}
        options={[
          { value: 'officer', label: t('role.officer') },
          { value: 'dealer', label: t('role.dealer') },
          { value: 'others', label: t('role.others') },
        ]}
      />

      <div role="tabpanel" id="role-panel" aria-labelledby={`role-tab-${role}`} tabIndex={-1}>
        {role === 'officer' && <OfficerLogin onSuccess={setSession} />}
        {role === 'dealer' && <DealerLogin onSuccess={setSession} />}
        {role === 'others' && (
          <>
            {!forgot && (
              <UserTypeSelector<OthersMode>
                columns={2}
                label={t('others.group')}
                idBase="others"
                value={othersMode}
                onChange={(m) => {
                  setOthersMode(m);
                  setBanner(null);
                }}
                options={[
                  { value: 'existing', label: t('others.existing') },
                  { value: 'new', label: t('others.new') },
                ]}
              />
            )}
            <div role="tabpanel" id="others-panel" aria-labelledby={`others-tab-${othersMode}`}>
              {forgot ? (
                <ForgotPasswordFlow
                  onBack={() => setForgot(false)}
                  onDone={() => {
                    setForgot(false);
                    setOthersMode('existing');
                    setBanner('reset');
                  }}
                />
              ) : othersMode === 'existing' ? (
                <PasswordLoginForm
                  kind="registered"
                  onSuccess={setSession}
                  onForgot={() => setForgot(true)}
                  notice={
                    banner && (
                      <AccessibleNotification kind="success">
                        {t(banner === 'reset' ? 'fp.success' : 'reg.success')}
                      </AccessibleNotification>
                    )
                  }
                />
              ) : (
                <RegistrationFlow
                  onBack={() => setOthersMode('existing')}
                  onDone={() => {
                    setOthersMode('existing');
                    setBanner('registered');
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
      </>
      )}
    </section>
  );
}
