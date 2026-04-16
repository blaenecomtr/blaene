import { useAdminContext } from '../context/AdminContext';
import { NotificationFeed } from '../components/dashboard/NotificationFeed';
import { Shell } from '../components/layout/Shell';
import { formatCurrency, formatNumber, formatPercent } from '../utils/format';

export default function Reports() {
  const { analytics, loadingData } = useAdminContext();

  if (loadingData && !analytics) {
    return (
      <Shell title="Raporlar">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
            <h2 className="mb-2 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Aylik Ozet</h2>
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
            </div>
          </article>
          <NotificationFeed />
        </div>
      </Shell>
    );
  }

  const range = analytics?.range?.label || 'Belirlenmis Aralik';
  const metrics = analytics?.metrics || {
    paid_revenue: 0,
    new_orders: 0,
    paid_orders: 0,
    conversion_rate: 0,
  };
  const categoryDist = analytics?.charts?.product_category_distribution || {};

  return (
    <Shell title="Raporlar">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-[11px] dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">{range} Ozeti</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-zinc-300">Toplam Gelir:</span>
              <span className="font-medium text-gray-900 dark:text-zinc-100">{formatCurrency(Number(metrics.paid_revenue || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-zinc-300">Siparis Sayisi:</span>
              <span className="font-medium text-gray-900 dark:text-zinc-100">{formatNumber(Number(metrics.new_orders || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-zinc-300">Odenen Siparis:</span>
              <span className="font-medium text-gray-900 dark:text-zinc-100">{formatNumber(Number(metrics.paid_orders || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-zinc-300">Donusum Orani:</span>
              <span className="font-medium text-gray-900 dark:text-zinc-100">{formatPercent(Number(metrics.conversion_rate || 0))}</span>
            </div>
          </div>

          {Object.keys(categoryDist).length > 0 && (
            <>
              <div className="mt-4 border-t border-gray-200 pt-3 dark:border-zinc-700">
                <h3 className="mb-2 font-medium text-gray-900 dark:text-zinc-100">Kategori Dagitimi</h3>
                <ul className="space-y-1 text-[10px]">
                  {Object.entries(categoryDist).map(([cat, count]) => (
                    <li key={cat} className="flex justify-between">
                      <span className="capitalize text-gray-700 dark:text-zinc-300">{cat}</span>
                      <span className="font-medium text-gray-900 dark:text-zinc-100">{formatNumber(Number(count || 0))} siparis</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </article>
        <NotificationFeed />
      </div>
    </Shell>
  );
}
