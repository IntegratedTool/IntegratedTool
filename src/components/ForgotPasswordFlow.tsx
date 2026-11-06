import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, type OtpChallenge } from '../services';
import { errorToMessage, type Msg } from '../utils/errorMessage';
import { useFocusFirstInvalid } from '../utils/useFocusFirstInvalid';
import { EMAIL_RE, isStrongPassword, maskEmail } from '../utils/validation';
import { AccessibleNotification } from './AccessibleNotification';
import { PasswordField, Spinner, TextField } from './fields';
import { OtpPanel } from './OtpPanel';

type Step = 'email' | 'confirm' | 'otp' | 'password';

interface Props {
  initialEmail?: string;
  onBack: () => void;
  onDone: () => void;
}

export function ForgotPasswordFlow({ initialEmail = '', onBack, onDone }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<{ email?: Msg; pw?: Msg; pw2?: Msg }>({});
  const [formErr, setFormErr] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, attempt);
  const tr = (m?: Msg | null) => (m ? t(m.key, m.vars) : undefined);
  const errBox = formErr && <AccessibleNotification kind="error">{t(formErr.key, formErr.vars)}</AccessibleNotification>;
  const backBtn = (
    <button type="button" className="link-btn" onClick={onBack}>
      {t('back')}
    </button>
  );

  const toConfirm = (ev: React.FormEvent) => {
    ev.preventDefault();
    setAttempt((n) => n + 1);
    const v = email.trim();
    if (!v) return setErrors({ email: { key: 'err.emailRequired' } });
    if (!EMAIL_RE.test(v)) return setErrors({ email: { key: 'err.emailFormat' } });
    setErrors({});
    setStep('confirm');
  };

  const sendOtp = async () => {
    setBusy(true);
    setFormErr(null);
    try {
      setChallenge(await api.resetSendOtp(email.trim()));
      setStep('otp');
    } catch (e) {
      setFormErr(errorToMessage(e, 'reset'));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAttempt((n) => n + 1);
    const e: typeof errors = {};
    if (!isStrongPassword(pw)) e.pw = { key: 'err.pwRule' };
    if (pw2 !== pw || !pw2) e.pw2 = { key: 'err.confirmMismatch' };
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormErr(null);
    try {
      await api.resetPassword(token, pw);
      onDone(); // back to login without signing in
    } catch (err) {
      setFormErr(errorToMessage(err, 'reset'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form">
      <h3>{t('fp.title')}</h3>
      {step === 'email' && (
        <form ref={formRef} className="form" onSubmit={toConfirm} noValidate>
          <p>{t('fp.intro')}</p>
          <TextField
            label={t('field.email')}
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            error={tr(errors.email)}
          />
          <div className="actions">
            <button type="submit" className="btn btn--primary">
              {t('fp.lookup')}
            </button>
            {backBtn}
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="form">
          {errBox}
          <p>
            {t('fp.confirmQ', { email: maskEmail(email.trim()) })}
          </p>
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void sendOtp()}>
              {busy && <Spinner />} {busy ? t('otp.sending') : t('otp.send')}
            </button>
            <button type="button" className="link-btn" onClick={() => { setStep('email'); setFormErr(null); }}>
              {t('reg.changeEmail')}
            </button>
          </div>
        </div>
      )}

      {step === 'otp' && challenge && (
        <OtpPanel
          challenge={challenge}
          onChallenge={setChallenge}
          ctx="reset"
          verify={async (otp) => {
            const r = await api.resetVerify(challenge.challengeId, otp);
            setToken(r.resetToken);
            setStep('password');
          }}
          extra={backBtn}
        />
      )}

      {step === 'password' && (
        <form ref={formRef} className="form" onSubmit={savePassword} noValidate>
          {errBox}
          <PasswordField
            label={t('fp.newPassword')}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            hint={t('err.pwRule')}
            error={tr(errors.pw)}
          />
          <PasswordField
            label={t('fp.confirmPassword')}
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            error={tr(errors.pw2)}
          />
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy && <Spinner />} {busy ? t('fp.saving') : t('fp.save')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
