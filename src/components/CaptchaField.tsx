import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, type CaptchaAnswer, type CaptchaChallenge } from '../services';
import { CAPTCHA_RE } from '../utils/validation';
import { formatTime } from '../utils/time';
import { Spinner } from './fields';

export interface CaptchaState {
  challenge: CaptchaChallenge | null;
  value: string;
  setValue: (v: string) => void;
  loading: boolean;
  /** seconds left, null until a challenge exists */
  secondsLeft: number | null;
  expired: boolean;
  refresh: () => Promise<void>;
  /** Returns null when the entered value is not a well-formed answer */
  answer: () => CaptchaAnswer | null;
  stopAudio: () => void;
}

/** Owns the CAPTCHA challenge lifecycle. The server issues, expires and validates challenges. */
export function useCaptcha(active: boolean): CaptchaState {
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }, []);

  const refresh = useCallback(async () => {
    stopAudio();
    setLoading(true);
    setValue('');
    try {
      const c = await api.captchaNew();
      setChallenge(c);
      setExpiresAt(Date.now() + c.expiresInSeconds * 1000);
      setNow(Date.now());
    } catch {
      setChallenge(null);
      setExpiresAt(null);
    } finally {
      setLoading(false);
    }
  }, [stopAudio]);

  useEffect(() => {
    if (active && !challenge && !loading) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => stopAudio, [stopAudio]);

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  return {
    challenge,
    value,
    setValue,
    loading,
    secondsLeft,
    expired: secondsLeft === 0,
    refresh,
    answer: () => (challenge && CAPTCHA_RE.test(value) ? { id: challenge.id, value } : null),
    stopAudio,
  };
}

interface Props {
  captcha: CaptchaState;
  error?: string;
  /** Shown above the field to explain why the CAPTCHA appeared */
  disabled?: boolean;
}

export function CaptchaField({ captcha, error, disabled }: Props) {
  const { t } = useI18n();
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const c = captcha.challenge;

  const listen = async () => {
    if (!c) return;
    setAudioError(false);
    captcha.stopAudio();
    try {
      const a = await api.captchaAudio(c.id);
      if (a.url) {
        const el = new Audio(a.url);
        el.onended = () => setPlaying(false);
        el.onerror = () => {
          setPlaying(false);
          setAudioError(true);
        };
        setPlaying(true);
        await el.play();
      } else if (a.speakText && typeof speechSynthesis !== 'undefined') {
        // PROTOTYPE ONLY: production plays a server-generated audio file; no browser speech, no answer in the page.
        const u = new SpeechSynthesisUtterance(a.speakText);
        u.rate = 0.7;
        u.onend = () => setPlaying(false);
        setPlaying(true);
        speechSynthesis.speak(u);
      } else {
        throw new Error('no audio');
      }
    } catch {
      setPlaying(false);
      setAudioError(true);
    }
  };

  const refresh = () => {
    setAudioError(false);
    setPlaying(false);
    void captcha.refresh();
  };

  const err = error ?? (audioError ? t('err.captchaAudio') : undefined);
  return (
    <div className="field captcha">
      <label htmlFor="captcha-input">
        {t('captcha.label')}
        <span aria-hidden="true"> *</span>
      </label>
      <div className="captcha__row">
        {c ? (
          <img className="captcha__img" src={c.imageUrl} alt={t('captcha.imageAlt')} width={170} height={44} />
        ) : (
          <div className="captcha__img captcha__img--empty">{captcha.loading ? <Spinner /> : t('captcha.loading')}</div>
        )}
        <button type="button" className="btn-icon" onClick={() => void listen()} disabled={!c || disabled} aria-pressed={playing}>
          <span aria-hidden="true">🔊 </span>
          {t('captcha.listen')}
        </button>
        <button type="button" className="btn-icon" onClick={refresh} disabled={captcha.loading || disabled}>
          <span aria-hidden="true">↻ </span>
          {t('captcha.refresh')}
        </button>
      </div>
      <input
        id="captcha-input"
        className="input"
        value={captcha.value}
        onChange={(e) => captcha.setValue(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6))}
        maxLength={6}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-required="true"
        aria-invalid={err ? true : undefined}
        aria-describedby="captcha-hint captcha-err"
        disabled={disabled}
      />
      <div id="captcha-hint" className="field__hint">
        {t('captcha.hint')}
        {captcha.secondsLeft !== null && !captcha.expired && (
          <span className="countdown"> · {formatTime(captcha.secondsLeft)}</span>
        )}
      </div>
      <div id="captcha-err" className={err ? 'field__error' : undefined}>
        {err}
      </div>
    </div>
  );
}
