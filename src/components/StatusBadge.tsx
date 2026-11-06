import { useI18n } from '../i18n';
import type { TicketStatus } from '../services';

const MARK: Record<TicketStatus, string> = { new: '●', inprogress: '◐', onhold: 'Ⅱ', resolved: '✓', closed: '■', withdrawn: '↩' };

/** Text + symbol + colour, so status never depends on colour alone. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useI18n();
  return (
    <span className={`badge badge--${status}`}>
      <span aria-hidden="true">{MARK[status]} </span>
      {t(`status.${status}`)}
    </span>
  );
}
