import { useRef, useState, type ReactNode } from 'react';
import { siteConfig } from '../config/site';
import { useI18n } from '../i18n';
import { api, type AuthResult } from '../services';
import { ApiError } from '../services';
import { errorToMessage, type Msg } from '../utils/errorMessage';
import { useFocusFirstInvalid } from '../utils/useFocusFirstInvalid';
import { EMAIL_RE, isAdminIdentifier } from '../utils/validation';
import { AccessibleNotification } from './AccessibleNotification';
import { CaptchaField, useCaptcha } from './CaptchaField';
import { PasswordField, Spinner, TextField } from './fields';

export type PasswordKind = 'admin' | 'officer' | 'registered';

interface Props {
  kind: PasswordKind;
  onSuccess: (r: AuthResult) => void;
  /** Officer only: called when the server reports the account is blocked */
  onBlocked?: (identifier: string) => void;
  onForgot?: () => void;
  /** Success message carried over from another flow (unblock / reset / registration) */
  notice?: ReactNode;
  children?: ReactNode;
}

const call = {
  admin: (i: Parameters<typeof api.adminLogin>[0]) => api.adminLogin(i),
  officer: (i: Parameters<typeof api.officerLogin>[0]) => api.officerLogin(i),
  registered: (i: Parameters<typeof api.registeredLogin>[0]) => api.registeredLogin(i),
};

/** Admin, Officer and Registered-user login. CAPTCHA appears only when the server asks for it. */
export function PasswordLoginForm({ kind, onSuccess, onBlocked, onForgot, notice, children }: Props) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [errors, setErrors] = useState<{ id?: Msg; pw?: Msg; captcha?: Msg }>({});
  const [formErr, setFormErr] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const captcha = useCaptcha(captchaRequired);
  useFocusFirstInvalid(formRef, attempt);
  const tr = (m?: Msg) => (m ? t(m.key, m.vars) : undefined);

  const label = kind === 'admin' ? t('field.adminId') : kind === 'officer' ? t('field.gpf') : t('field.email');

  const validate = () => {
    const e: typeof errors = {};
    const id = identifier.trim();
    if (!id) e.id = { key: kind === 'admin' ? 'err.adminIdRequired' : kind === 'officer' ? 'err.gpfRequired' : 'err.emailRequired' };
    else if (kind === 'admin' && siteConfig.useMock && !isAdminIdentifier(id, siteConfig.adminUsername)) e.id = { key: 'err.adminIdFormat' };
    else if (kind === 'registered' && !EMAIL_RE.test(id)) e.id = { key: 'err.emailFormat' };
    if (!password) e.pw = { key: 'err.passwordRequired' };
    if (captchaRequired) {
      if (!captcha.value) e.captcha = { key: 'err.captchaRequired' };
      else if (!captcha.answer()) e.captcha = { key: 'err.captchaFormat' };
      else if (captcha.expired) e.captcha = { key: 'err.captchaExpired' };
    }
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setAttempt((n) => n + 1);
    setFormErr(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await call[kind]({
        identifier: identifier.trim(),
        password, // never trimmed or altered
        captcha: captchaRequired ? (captcha.answer() ?? undefined) : undefined,
      });
      onSuccess(r);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_BLOCKED' && kind === 'officer') {
        onBlocked?.(identifier.trim());
        return;
      }
      if (err instanceof ApiError && err.meta.captchaRequired) {
        if (captchaRequired) void captcha.refresh(); // a fresh challenge after every unsuccessful submission
        setCaptchaRequired(true);
      }
      const m = errorToMessage(err, kind);
      if (m.key.startsWith('err.captcha')) setErrors({ captcha: m });
      else setFormErr(m);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} className="form" onSubmit={submit} noValidate>
      {notice}
      {kind === 'officer' && <p className="field__hint">{t('officer.hint')}</p>}
      {formErr && <AccessibleNotification kind="error">{t(formErr.key, formErr.vars)}</AccessibleNotification>}
      <TextField
        label={label}
        required
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        autoComplete="username"
        inputMode={kind === 'officer' ? 'numeric' : 'email'}
        error={tr(errors.id)}
      />
      <PasswordField
        label={t('field.password')}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        error={tr(errors.pw)}
      />
      {captchaRequired && <CaptchaField captcha={captcha} error={tr(errors.captcha)} />}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy && <Spinner />} {busy ? t('signingIn') : t('signin')}
        </button>
        {onForgot && (
          <button type="button" className="link-btn" onClick={onForgot}>
            {t('forgot')}
          </button>
        )}
      </div>
      {children}
    </form>
  );
}
