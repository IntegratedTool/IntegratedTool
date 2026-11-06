import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, type OtpChallenge } from '../services';
import { errorToMessage, type Msg } from '../utils/errorMessage';
import { useFocusFirstInvalid } from '../utils/useFocusFirstInvalid';
import { EMAIL_RE, MOBILE_RE, isStrongPassword, isValidName } from '../utils/validation';
import { AccessibleNotification } from './AccessibleNotification';
import { PasswordField, SelectField, Spinner, TextField } from './fields';
import { OtpPanel } from './OtpPanel';

export function RegistrationFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: '', email: '', mobile: '', district: '', password: '', confirm: '' });
  const [districts, setDistricts] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, Msg>>>({});
  const [formErr, setFormErr] = useState<Msg | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, attempt);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const tr = (m?: Msg) => (m ? t(m.key, m.vars) : undefined);

  useEffect(() => {
    api.getDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const backBtn = (
    <button type="button" className="link-btn" onClick={onBack}>
      {t('back')}
    </button>
  );

  const sendOtp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setAttempt((n) => n + 1);
    setFormErr(null);
    const e: typeof errors = {};
    if (!f.name.trim()) e.name = { key: 'err.nameRequired' };
    else if (!isValidName(f.name)) e.name = { key: 'err.nameFormat' };
    if (!f.email.trim()) e.email = { key: 'err.emailRequired' };
    else if (!EMAIL_RE.test(f.email.trim())) e.email = { key: 'err.emailFormat' };
    if (!f.mobile) e.mobile = { key: 'err.mobileRequired' };
    else if (!MOBILE_RE.test(f.mobile)) e.mobile = { key: 'err.mobileFormat' };
    if (!f.district) e.district = { key: 'err.districtRequired' };
    if (!isStrongPassword(f.password)) e.password = { key: 'err.pwRule' };
    if (!f.confirm || f.confirm !== f.password) e.confirm = { key: 'err.confirmMismatch' };
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      setChallenge(
        await api.registrationSendOtp({
          name: f.name.trim(),
          email: f.email.trim(),
          mobile: f.mobile,
          district: f.district,
          password: f.password,
        }),
      );
    } catch (err) {
      setFormErr(errorToMessage(err, 'other'));
    } finally {
      setBusy(false);
    }
  };

  if (challenge) {
    return (
      <OtpPanel
        challenge={challenge}
        onChallenge={setChallenge}
        verifyLabel={t('reg.verify')}
        busyLabel={t('reg.verifying')}
        verify={async (otp) => {
          await api.registrationVerify(challenge.challengeId, otp);
          onDone();
        }}
        extra={
          <>
            <button type="button" className="link-btn" onClick={() => setChallenge(null)}>
              {t('reg.changeEmail')}
            </button>
            {backBtn}
          </>
        }
      />
    );
  }

  return (
    <form ref={formRef} className="form" onSubmit={sendOtp} noValidate>
      {formErr && <AccessibleNotification kind="error">{t(formErr.key, formErr.vars)}</AccessibleNotification>}
      <div className="form-grid">
        <div className="span-2">
          <TextField label={t('reg.name')} required value={f.name} onChange={set('name')} maxLength={60} autoComplete="name" hint={t('reg.nameHint')} error={tr(errors.name)} />
        </div>
        <TextField label={t('reg.email')} required type="email" value={f.email} onChange={set('email')} autoComplete="email" error={tr(errors.email)} />
        <TextField
          label={t('reg.mobile')}
          required
          value={f.mobile}
          onChange={(e) => setF((p) => ({ ...p, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
          inputMode="numeric"
          autoComplete="tel-national"
          error={tr(errors.mobile)}
        />
        <div className="span-2">
          <SelectField label={t('reg.district')} required value={f.district} onChange={set('district')} error={tr(errors.district)}>
            <option value="">{t('reg.districtChoose')}</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
        </div>
        <PasswordField label={t('reg.password')} required value={f.password} onChange={set('password')} autoComplete="new-password" error={tr(errors.password)} />
        <PasswordField label={t('reg.confirm')} required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" error={tr(errors.confirm)} />
      </div>
      <p className="field__hint">{t('err.pwRule')}</p>
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy && <Spinner />} {busy ? t('otp.sending') : t('reg.sendOtp')}
        </button>
        {backBtn}
      </div>
    </form>
  );
}
