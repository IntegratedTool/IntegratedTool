import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { api, type OtpChallenge } from '../services';
import { siteConfig } from '../config/site';
import { errorToMessage, type ErrorContext, type Msg } from '../utils/errorMessage';
import { formatTime } from '../utils/time';
import { AccessibleNotification } from './AccessibleNotification';
import { Spinner, TextField } from './fields';

interface Props {
  challenge: OtpChallenge;
  onChallenge: (c: OtpChallenge) => void;
  /** Resolve on success; reject with an ApiError on failure. The panel never decides success itself. */
  verify: (otp: string) => Promise<void>;
  verifyLabel?: string;
  busyLabel?: string;
  ctx?: ErrorContext;
  /** e.g. a Back / change button supplied by the flow */
  extra?: ReactNode;
}

/** Shared OTP step: expiry, resend delay, attempts left and lock countdowns (rules in section 1.6). */
export function OtpPanel({ challenge, onChallenge, verify, verifyLabel, busyLabel, ctx = 'other', extra }: Props) {
  const { t } = useI18n();
  const digits = siteConfig.otpLengthDigits;
  const [otp, setOtp] = useState('');
  const [fieldErr, setFieldErr] = useState<Msg | null>(null);
  const [formErr, setFormErr] = useState<Msg | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [lockUntil, setLockUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const issued = useRef(Date.now());
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    issued.current = Date.now();
    setNow(Date.now());
  }, [challenge.challengeId]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiresIn = Math.max(0, Math.ceil((issued.current + challenge.validitySeconds * 1000 - now) / 1000));
  const resendIn = Math.max(0, Math.ceil((issued.current + challenge.resendAfterSeconds * 1000 - now) / 1000));
  const lockLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const locked = lockLeft > 0;
  const expired = expiresIn === 0;

  const handleError = (e: unknown) => {
    const m = errorToMessage(e, ctx, digits);
    if (m.key === 'otp.lockedNote') {
      const secs = Number((e as { meta?: Record<string, number> }).meta?.waitSeconds ?? 0);
      setLockUntil(Date.now() + secs * 1000);
      setFormErr(null);
    } else {
      setFormErr(m);
      const meta = (e as { meta?: Record<string, number> }).meta;
      if (m.key === 'err.otpInvalid' && meta?.left !== undefined) setLeft(Number(meta.left));
    }
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy || locked) return;
    setFormErr(null);
    // Empty or malformed input is rejected locally and never consumes an attempt.
    if (!otp) return setFieldErr({ key: 'err.otpRequired' });
    if (!new RegExp(`^[0-9]{${digits}}$`).test(otp)) return setFieldErr({ key: 'err.otpFormat', vars: { digits } });
    setFieldErr(null);
    setBusy(true);
    try {
      await verify(otp);
    } catch (e) {
      handleError(e);
      setOtp('');
      inputRef.current?.querySelector('input')?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setFormErr(null);
    try {
      const c = await api.otpResend(challenge.challengeId);
      onChallenge(c);
      setOtp('');
      setFieldErr(null);
    } catch (e) {
      handleError(e);
    } finally {
      setResending(false);
    }
  };

  const tr = (m: Msg) => t(m.key, m.vars);
  return (
    <form className="form" onSubmit={submit} noValidate aria-label={t('otp.title')}>
      <AccessibleNotification kind="info">
        {t('otp.sentStatus', { email: challenge.maskedEmail })}
      </AccessibleNotification>
      {locked && <AccessibleNotification kind="error">{t('otp.lockedNote', { time: formatTime(lockLeft) })}</AccessibleNotification>}
      {formErr && !locked && <AccessibleNotification kind="error">{tr(formErr)}</AccessibleNotification>}
      {expired && !locked && <AccessibleNotification kind="warn">{t('otp.expiredNote')}</AccessibleNotification>}

      <div ref={inputRef}>
        <TextField
          label={t('otp.label')}
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, digits))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={digits}
          disabled={locked}
          hint={t('otp.hint', { digits })}
          error={fieldErr ? tr(fieldErr) : undefined}
        />
      </div>
      <p className="countdown" aria-live="off">
        {!expired && t('otp.expiresIn', { time: formatTime(expiresIn) })}
        {left !== null && !locked && ` · ${t('otp.attemptsLeft', { left })}`}
        {challenge.resendsLeft !== undefined && !locked && ` · ${t('otp.resendsLeft', { n: challenge.resendsLeft })}`}
      </p>

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy || locked || expired}>
          {busy ? <Spinner /> : null} {busy ? (busyLabel ?? t('otp.verifying')) : (verifyLabel ?? t('otp.verify'))}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void resend()}
          disabled={resending || locked || resendIn > 0 || challenge.resendsLeft === 0}
        >
          {resendIn > 0 ? t('otp.resendIn', { time: formatTime(resendIn) }) : t('otp.resend')}
        </button>
        {extra}
      </div>
    </form>
  );
}
