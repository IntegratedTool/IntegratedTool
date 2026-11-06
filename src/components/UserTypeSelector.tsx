import { useRef, type KeyboardEvent } from 'react';

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name of the tablist */
  label: string;
  /** Prefix used to build tab/panel ids; panels must use `${idBase}-panel` as id */
  idBase: string;
  /** number of columns; 2x2 grid on small screens when 4 */
  columns?: 2 | 3 | 4;
}

/**
 * WAI-ARIA tabs pattern (automatic activation): roving tabindex, Left/Right/Home/End keys.
 * Used for the Officer/Dealer/Others selector and the Existing/New user switch.
 */
export function UserTypeSelector<T extends string>({ options, value, onChange, label, idBase, columns = 3 }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className={`segmented segmented--${columns}`} role="tablist" aria-label={label}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${o.value}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
