import { useI18n } from '../i18n';
import type { TicketStatus } from '../services';

const DAY = 86_400_000;

/** How long an open case has been waiting. Text + shape + colour, so it never relies on colour alone. */
export function AgeChip({ createdAt, status }: { createdAt: string; status: TicketStatus }) {
  const { t } = useI18n();
  if (status !== 'new' && status !== 'inprogress' && status !== 'onhold') return <span aria-hidden="true">—</span>;
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / DAY));
  const level = days >= 15 ? 'high' : days >= 7 ? 'mid' : 'low';
  return (
    <span className={`age age--${level}`}>
      <span aria-hidden="true">{level === 'high' ? '▲▲' : level === 'mid' ? '▲' : '●'} </span>
      {t('age.days', { n: days })}
    </span>
  );
}
