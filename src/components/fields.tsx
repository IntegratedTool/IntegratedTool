import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { useI18n } from '../i18n';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** extra class for the input element */
  inputClassName?: string;
}

/** Labelled text input with hint and error programmatically associated via aria-describedby. */
export function TextField({ label, hint, error, inputClassName = '', required, ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        className={`input ${inputClassName}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...rest}
      />
      {hint && (
        <div id={hintId} className="field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errId} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}

/** Password input with an accessible show/hide toggle. */
export function PasswordField({ label, hint, error, required, ...rest }: Omit<FieldProps, 'type' | 'inputClassName'>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="pw">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          autoCapitalize="none"
          spellCheck={false}
          {...rest}
        />
        <button
          type="button"
          className="pw__toggle"
          aria-pressed={visible}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? t('hide') : t('show')}
        </button>
      </div>
      {hint && (
        <div id={hintId} className="field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errId} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  required,
  children,
  ...rest
}: Omit<InputHTMLAttributes<HTMLSelectElement>, 'id'> & { label: string; error?: string; children: ReactNode }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        aria-required={required || undefined}
        {...(rest as object)}
      >
        {children}
      </select>
      {error && (
        <div id={errId} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

interface RadioProps<T extends string> {
  legend: string;
  name: string;
  value: T | '';
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  error?: string;
  inline?: boolean;
}

/** Radio group in a fieldset so the legend is announced with each option. */
export function RadioGroup<T extends string>({ legend, name, value, onChange, options, error, inline }: RadioProps<T>) {
  const id = useId();
  return (
    <fieldset className="field radio-group" aria-describedby={error ? `${id}-err` : undefined}>
      <legend>{legend}</legend>
      <div className={inline ? 'radio-group__row' : undefined}>
        {options.map((o) => (
          <label key={o.value} className="radio">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <div id={`${id}-err`} className="field__error">
          {error}
        </div>
      )}
    </fieldset>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...rest}
      />
      {hint && (
        <div id={`${id}-hint`} className="field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={`${id}-err`} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}
