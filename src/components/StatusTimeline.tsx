import { useI18n, type TKey } from '../i18n';
import type { TicketStatus } from '../services';

/** Where the case is in its life, as a simple progress line. */
export function StatusTimeline({ status }: { status: TicketStatus }) {
  const { t } = useI18n();
  const steps: TicketStatus[] = status === 'withdrawn' ? ['new', 'withdrawn'] : ['new', 'inprogress', 'resolved', 'closed'];
  const at = status === 'onhold' ? 1 : steps.indexOf(status);
  return (
    <ol className="timeline" aria-label={t('tl.label')}>
      {steps.map((s, i) => {
        const here = i === at;
        const label = here && status === 'onhold' ? t('status.onhold') : s === 'new' ? t('tl.raised') : t(`status.${s}` as TKey);
        return (
          <li key={s} className={`timeline__step${i < at ? ' is-done' : ''}${here ? ' is-current' : ''}`} aria-current={here ? 'step' : undefined}>
            <span className="timeline__dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>
            <span className="timeline__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
