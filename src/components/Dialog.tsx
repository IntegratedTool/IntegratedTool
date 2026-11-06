import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal dialog: focus moves in, Tab is trapped, Escape closes, focus returns to the opener. */
export function Dialog({ title, onClose, children }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('textarea, input, select, button');
    first?.focus();
    return () => opener?.focus();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key !== 'Tab') return;
    const items = ref.current?.querySelectorAll<HTMLElement>('textarea, input, select, button:not(:disabled)');
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={onKey}>
        <h3 id={id}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
