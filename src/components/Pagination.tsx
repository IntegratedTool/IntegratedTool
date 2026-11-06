import { useI18n } from '../i18n';

export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="pager" aria-label={t('page.label')}>
      <button type="button" className="btn btn--secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('page.prev')}
      </button>
      <span aria-live="polite">{t('page.of', { page, pages })}</span>
      <button type="button" className="btn btn--secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('page.next')}
      </button>
    </nav>
  );
}
