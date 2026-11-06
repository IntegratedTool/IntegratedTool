import { useRef, useState } from 'react';
import { useI18n, type TKey } from '../i18n';
import { api, type AuthResult, type DealerKind, type DealerLookup, type OtpChallenge } from '../services';
import { errorToMessage, type Msg } from '../utils/errorMessage';
import { useFocusFirstInvalid } from '../utils/useFocusFirstInvalid';
import { gstinProblem, tinProblem } from '../utils/gstin';
import { normaliseGstin, normaliseTin } from '../utils/validation';
import { AccessibleNotification } from './AccessibleNotification';
import { RadioGroup, Spinner, TextField } from './fields';
import { OtpPanel } from './OtpPanel';

type Step = 'id' | 'confirm' | 'otp';

export function DealerLogin({ onSuccess }: { onSuccess: (r: AuthResult) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<DealerKind>('gst');
  const [identifier, setIdentifier] = useState('');
  const [step, setStep] = useState<Step>('id');
  const [lookup, setLookup] = useState<DealerLookup | null>(null);
  const [access, setAccess] = useState<'yes' | 'no' | ''>('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [fieldErr, setFieldErr] = useState<Msg | null>(null);
  const [formErr, setFormErr] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, attempt);
  const tr = (m?: Msg | null) => (m ? t(m.key, m.vars) : undefined);

  // Changing the type or the number discards the lookup and any OTP flow: a fresh lookup is required.
  const restart = () => {
    setStep('id');
    setLookup(null);
    setChallenge(null);
    setAccess('');
    setFormErr(null);
  };

  const doLookup = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setAttempt((n) => n + 1);
    setFormErr(null);
    const id = kind === 'gst' ? normaliseGstin(identifier) : normaliseTin(identifier);
    if (!id) return setFieldErr({ key: kind === 'gst' ? 'err.gstinRequired' : 'err.tinRequired' });
    const problem = kind === 'gst' ? gstinProblem(id, { checksum: true }) : tinProblem(id);
    if (problem) return setFieldErr({ key: `err.${kind === 'gst' ? 'gstin' : 'tin'}.${problem}` as TKey });
    setFieldErr(null);
    setBusy(true);
    try {
      setLookup(await api.dealerLookup(kind, id));
      setStep('confirm');
    } catch (e) {
      setFormErr(errorToMessage(e, kind === 'gst' ? 'dealer-gst' : 'dealer-tin'));
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!lookup || busy) return;
    setBusy(true);
    setFormErr(null);
    try {
      setChallenge(await api.dealerSendOtp(lookup.lookupId));
      setStep('otp');
    } catch (e) {
      setFormErr(errorToMessage(e, 'dealer-gst'));
    } finally {
      setBusy(false);
    }
  };

  const changeBtn = (
    <button type="button" className="link-btn" onClick={restart}>
      {t('dealer.change')}
    </button>
  );

  if (step === 'otp' && challenge) {
    return (
      <OtpPanel
        challenge={challenge}
        onChallenge={setChallenge}
        ctx="dealer-gst"
        verify={async (otp) => onSuccess(await api.dealerVerify(challenge.challengeId, otp))}
        extra={changeBtn}
      />
    );
  }

  if (step === 'confirm' && lookup) {
    return (
      <div className="form">
        {formErr && <AccessibleNotification kind="error">{t(formErr.key, formErr.vars)}</AccessibleNotification>}
        <div className="field">
          <span className="label">{t('dealer.email')}</span>
          <span className="masked" data-testid="dealer-masked-email">{lookup.maskedEmail}</span>
          <span className="field__hint">{t('dealer.privacy')}</span>
        </div>
        <RadioGroup<'yes' | 'no'>
          legend={t('dealer.confirmGroup')}
          name="dealer-access"
          value={access}
          onChange={setAccess}
          options={[
            { value: 'yes', label: t('dealer.hasAccess') },
            { value: 'no', label: t('dealer.noAccess') },
          ]}
        />
        {access === 'no' && <AccessibleNotification kind="warn">{t('dealer.noAccessMsg')}</AccessibleNotification>}
        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={access !== 'yes' || busy} onClick={() => void sendOtp()}>
            {busy && <Spinner />} {busy ? t('otp.sending') : t('otp.send')}
          </button>
          {changeBtn}
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} className="form" onSubmit={doLookup} noValidate>
      {formErr && <AccessibleNotification kind="error">{t(formErr.key, formErr.vars)}</AccessibleNotification>}
      <RadioGroup<DealerKind>
        inline
        legend={t('dealer.type')}
        name="dealer-kind"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setIdentifier('');
          setFieldErr(null);
          setFormErr(null);
        }}
        options={[
          { value: 'gst', label: t('dealer.gst') },
          { value: 'vat', label: t('dealer.vat') },
        ]}
      />
      <TextField
        label={kind === 'gst' ? t('dealer.gstin') : t('dealer.tin')}
        required
        value={identifier}
        onChange={(e) => setIdentifier(kind === 'gst' ? e.target.value.toUpperCase() : e.target.value)}
        maxLength={kind === 'gst' ? 15 : 11}
        inputMode={kind === 'gst' ? 'text' : 'numeric'}
        autoComplete="off"
        spellCheck={false}
        hint={kind === 'gst' ? t('dealer.gstinHint') : t('dealer.tinHint')}
        error={tr(fieldErr)}
      />
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy && <Spinner />} {busy ? t('dealer.checking') : t('dealer.continue')}
        </button>
      </div>
    </form>
  );
}
