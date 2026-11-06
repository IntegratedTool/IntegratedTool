import { useState } from 'react';
import { useI18n } from '../i18n';
import { api, type AuthResult, type OtpChallenge } from '../services';
import { errorToMessage, type Msg } from '../utils/errorMessage';
import { AccessibleNotification } from './AccessibleNotification';
import { Spinner } from './fields';
import { OtpPanel } from './OtpPanel';
import { PasswordLoginForm } from './PasswordLoginForm';

type Step = 'login' | 'blocked' | 'otp';

export function OfficerLogin({ onSuccess }: { onSuccess: (r: AuthResult) => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('login');
  const [gpf, setGpf] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [unblocked, setUnblocked] = useState(false);
  const [err, setErr] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

  const toLogin = () => {
    setStep('login');
    setChallenge(null);
    setErr(null);
  };

  const sendOtp = async () => {
    setBusy(true);
    setErr(null);
    try {
      setChallenge(await api.officerSendUnblockOtp(gpf));
      setStep('otp');
    } catch (e) {
      setErr(errorToMessage(e, 'officer'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'login') {
    return (
      <PasswordLoginForm
        kind="officer"
        onSuccess={onSuccess}
        onBlocked={(id) => {
          setGpf(id);
          setUnblocked(false);
          setStep('blocked');
        }}
        notice={unblocked ? <AccessibleNotification kind="success">{t('officer.unblocked')}</AccessibleNotification> : undefined}
      />
    );
  }

  const backBtn = (
    <button type="button" className="link-btn" onClick={toLogin}>
      {t('back')}
    </button>
  );

  if (step === 'blocked' || !challenge) {
    return (
      <div className="form">
        <AccessibleNotification kind="error">{t('err.blocked')}</AccessibleNotification>
        {err && <AccessibleNotification kind="error">{t(err.key, err.vars)}</AccessibleNotification>}
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => void sendOtp()} disabled={busy}>
            {busy && <Spinner />} {busy ? t('otp.sending') : t('officer.sendOtp')}
          </button>
          {backBtn}
        </div>
      </div>
    );
  }

  return (
    <OtpPanel
      challenge={challenge}
      onChallenge={setChallenge}
      ctx="officer"
      verify={async (otp) => {
        await api.officerUnblockVerify(challenge.challengeId, otp);
        // Unblocking never signs the officer in: return to the login form.
        setUnblocked(true);
        toLogin();
      }}
      extra={backBtn}
    />
  );
}
