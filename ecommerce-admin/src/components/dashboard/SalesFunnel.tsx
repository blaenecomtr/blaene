import { useMemo } from 'react';
import { useAdminContext } from '../../context/AdminContext';
import { formatNumber, formatPercent } from '../../utils/format';

const shades = ['bg-blue-700', 'bg-blue-600', 'bg-blue-500', 'bg-blue-400', 'bg-blue-300'];

function statusLabel(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === 'pending') return 'Beklemede';
  if (normalized === 'processing') return 'Hazirlaniyor';
  if (normalized === 'shipped') return 'Kargoya Verildi';
  if (normalized === 'delivered') return 'Teslim Edildi';
  if (normalized === 'cancelled') return 'Iptal';
  return key;
}

export function SalesFunnel() {
  const { analytics } = useAdminContext();

  const steps = useMemo(() => {
    const statusCounts = analytics?.charts?.order_status_distribution || {};
    const entries = Object.entries(statusCounts)
      .map(([key, value]) => ({
        id: key,
        label: statusLabel(key),
        count: Number(value || 0),
      }))
      .sort((a, b) => b.count - a.count);

    const top = entries[0]?.count || 0;
    return entries.map((entry) => ({
      ...entry,
      percentage: top > 0 ? Math.round((entry.count / top) * 100) : 0,
    }));
  }, [analytics]);

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Siparis Durum Hunisi</h2>

      {steps.length ? (
        <>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-gray-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-gray-700 dark:text-zinc-200">{step.label}</span>
                  <span className="text-gray-500 dark:text-zinc-400">
                    {formatNumber(step.count)} / {formatPercent(step.percentage)}
                  </span>
                </div>
                <div className="h-2 rounded bg-gray-100 dark:bg-zinc-700">
                  <div
                    className={`h-2 rounded ${shades[index % shades.length]}`}
                    style={{ width: `${step.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
            Odeme donusum orani: {formatPercent(Number(analytics?.metrics?.conversion_rate || 0))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500 dark:text-zinc-400">Durum hunisi verisi bulunamadi.</p>
      )}
    </article>
  );
}

