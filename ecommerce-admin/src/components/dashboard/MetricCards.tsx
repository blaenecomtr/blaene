import { useAdminContext } from '../../context/AdminContext';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format';

interface MetricCardView {
  id: string;
  label: string;
  value: string;
  helper: string;
}

export function MetricCards() {
  const { analytics, loadingData } = useAdminContext();

  const cards: MetricCardView[] = analytics
    ? [
        {
          id: 'paid_revenue',
          label: 'Odenen Ciro',
          value: formatCurrency(Number(analytics.metrics.paid_revenue || 0)),
          helper: 'Secili aralik',
        },
        {
          id: 'new_orders',
          label: 'Toplam Siparis',
          value: formatNumber(Number(analytics.metrics.new_orders || 0)),
          helper: 'Secili aralik',
        },
        {
          id: 'paid_orders',
          label: 'Odenen Siparis',
          value: formatNumber(Number(analytics.metrics.paid_orders || 0)),
          helper: `${formatPercent(Number(analytics.metrics.conversion_rate || 0))} donusum`,
        },
        {
          id: 'active_users',
          label: 'Aktif Uye',
          value: formatNumber(Number(analytics.metrics.active_users || 0)),
          helper: `${formatNumber(Number(analytics.metrics.scoped_new_users || 0))} yeni uye`,
        },
      ]
    : [];

  if (loadingData && !cards.length) {
    return (
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article
            key={`metric-skeleton-${index}`}
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
            <div className="mt-3 h-6 w-20 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
          </article>
        ))}
      </section>
    );
  }

  if (!cards.length) {
    return (
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Metrik verisi bulunamadi.
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((metric) => (
        <article
          key={metric.id}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <p className="text-[12px] font-medium text-gray-500 dark:text-zinc-400">{metric.label}</p>
          <p className="mt-2 text-[20px] font-medium text-gray-900 dark:text-gray-100">{metric.value}</p>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">{metric.helper}</p>
        </article>
      ))}
    </section>
  );
}

