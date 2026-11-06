import type { ReactNode } from 'react';

export type NoticeKind = 'error' | 'success' | 'info' | 'warn';

const ICONS: Record<NoticeKind, string> = { error: '✖', success: '✔', info: 'ℹ', warn: '⚠' };

interface Props {
  kind: NoticeKind;
  title?: string;
  children: ReactNode;
  /** Optional ref/id so a form can move focus here after a failed submit */
  id?: string;
}

/**
 * Status message that never relies on colour alone (icon + text) and is announced
 * by screen readers: errors use role="alert", everything else role="status".
 */
export function AccessibleNotification({ kind, title, children, id }: Props) {
  return (
    <div
      id={id}
      className={`notice notice--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
    >
      <span className="notice__icon" aria-hidden="true">
        {ICONS[kind]}
      </span>
      <div>
        {title && <strong>{title}. </strong>}
        {children}
      </div>
    </div>
  );
}
