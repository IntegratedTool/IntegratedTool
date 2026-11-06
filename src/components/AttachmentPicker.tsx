import { useId, useRef } from 'react';
import { useI18n } from '../i18n';
import { kb, mb } from '../utils/format';
import type { FormLimits } from '../services';

export interface Slot {
  id: number;
  file: File | null;
  error?: 'err.t.fileType' | 'err.t.fileDup';
}

interface Props {
  slots: Slot[];
  limits: FormLimits;
  /** Hardware: the first control is the Device Serial Number Proof */
  proofRequired: boolean;
  error?: string;
  onPick: (id: number, file: File | null) => void;
}

function Row({ slot, label, onPick, error }: { slot: Slot; label: string; onPick: Props['onPick']; error?: string }) {
  const { t } = useI18n();
  const inputId = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="att">
      <label htmlFor={inputId}>{label}</label>
      <div className="att__row">
        <input
          ref={ref}
          id={inputId}
          type="file"
          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
          aria-invalid={slot.error || error ? true : undefined}
          onChange={(e) => onPick(slot.id, e.target.files?.[0] ?? null)}
        />
        {slot.file && (
          <>
            <span className="att__name">
              ({kb(slot.file.size)})
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                if (ref.current) ref.current.value = '';
                onPick(slot.id, null);
              }}
            >
              {t('att.clear')}
            </button>
          </>
        )}
      </div>
      {slot.error && <div className="field__error">{t(slot.error)}</div>}
    </div>
  );
}

export function AttachmentPicker({ slots, limits, proofRequired, error, onPick }: Props) {
  const { t } = useI18n();
  const used = slots.reduce((n, s) => n + (s.file?.size ?? 0), 0);
  const over = used > limits.maxTotalMB * 1024 * 1024;
  return (
    <fieldset className="field att-group">
      <legend>{t('sec.attachments')}</legend>
      <p className="field__hint">{t('att.rules', { n: limits.maxFiles, mb: limits.maxTotalMB })}</p>
      {slots.map((s, i) => (
        <Row
          key={s.id}
          slot={s}
          error={i === 0 ? error : undefined}
          label={proofRequired && i === 0 ? `${t('att.proof')} *` : t('att.label', { n: i + 1 })}
          onPick={onPick}
        />
      ))}
      <div className="att__foot">
        <span className={`countdown${over ? ' is-over' : ''}`} aria-live="polite">
          {t('att.used', { used: mb(used), max: limits.maxTotalMB })}
        </span>
      </div>
      {error && <div className="field__error">{error}</div>}
    </fieldset>
  );
}
