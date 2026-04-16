import { useMemo } from 'react';
import { useAdminContext } from '../../context/AdminContext';
import { formatNumber, formatPercent } from '../../utils/format';

const colorClasses = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-slate-500'];

function paymentLabel(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === 'paid') return 'Odendi';
  if (normalized === 'pending') return 'Beklemede';
  if (normalized === 'failed') return 'Basarisiz';
  return key;
}

export function TrafficSources() {
  const { analytics } = useAdminContext();

  const rows = useMemo(() => {
    const distribution = analytics?.charts?.payment_distribution || {};
    const entries = Object.entries(distribution)
      .map(([key, value]) => ({
        key,
        label: paymentLabel(key),
        count: Number(value || 0),
      }))
      .sort((a, b) => b.count - a.count);

    const total = entries.reduce((sum, item) => sum + item.count, 0);
    return entries.map((entry, index) => ({
      ...entry,
      percentage: total > 0 ? (entry.count / total) * 100 : 0,
      colorClass: colorClasses[index % colorClasses.length],
    }));
  }, [analytics]);

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Odeme Dagilimi</h2>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="inline-flex items-center gap-2 text-gray-700 dark:text-zinc-200">
                <span className={`h-2 w-2 rounded-full ${item.colorClass}`} />
                {item.label}
              </span>
              <span className="inline-flex items-center gap-3 text-gray-500 dark:text-zinc-400">
                <span>{formatNumber(item.count)}</span>
                <span>{formatPercent(item.percentage)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 dark:text-zinc-400">Odeme dagilimi verisi bulunamadi.</p>
      )}
    </article>
  );
}

