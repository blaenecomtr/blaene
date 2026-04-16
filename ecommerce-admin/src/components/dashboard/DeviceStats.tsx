import { useMemo } from 'react';
import { useAdminContext } from '../../context/AdminContext';
import { formatNumber } from '../../utils/format';

function levelClass(percentage: number) {
  if (percentage >= 70) return 'bg-emerald-500';
  if (percentage >= 35) return 'bg-amber-500';
  return 'bg-red-500';
}

export function DeviceStats() {
  const { analytics, products } = useAdminContext();

  const stockByCategory = useMemo(() => {
    const distribution = analytics?.charts?.product_category_distribution || {};
    const entries = Object.entries(distribution).map(([key, value]) => ({
      label: key,
      count: Number(value || 0),
    }));
    const total = entries.reduce((sum, item) => sum + item.count, 0);
    return entries.map((entry) => ({
      ...entry,
      percentage: total > 0 ? Math.round((entry.count / total) * 100) : 0,
    }));
  }, [analytics]);

  const activeProducts = products.filter((product) => product.active !== false).length;
  const passiveProducts = Math.max(products.length - activeProducts, 0);

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Stok ve Destek Durumu</h2>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-gray-500 dark:text-zinc-400">Aktif urun</p>
          <p className="mt-1 text-[14px] font-semibold text-gray-900 dark:text-zinc-100">{formatNumber(activeProducts)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-gray-500 dark:text-zinc-400">Pasif urun</p>
          <p className="mt-1 text-[14px] font-semibold text-gray-900 dark:text-zinc-100">{formatNumber(passiveProducts)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-gray-500 dark:text-zinc-400">Dusuk stok</p>
          <p className="mt-1 text-[14px] font-semibold text-gray-900 dark:text-zinc-100">
            {formatNumber(Number(analytics?.metrics?.low_stock_products || 0))}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-gray-500 dark:text-zinc-400">Acik destek</p>
          <p className="mt-1 text-[14px] font-semibold text-gray-900 dark:text-zinc-100">
            {formatNumber(Number(analytics?.metrics?.open_support_tickets || 0))}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-medium text-gray-500 dark:text-zinc-400">Kategori dagilimi</p>
        {stockByCategory.length ? (
          stockByCategory.map((stat) => (
            <div key={stat.label} className="space-y-1 text-[10px]">
              <div className="flex items-center justify-between text-gray-600 dark:text-zinc-300">
                <span>{stat.label}</span>
                <span>%{stat.percentage}</span>
              </div>
              <div className="h-2 rounded bg-gray-100 dark:bg-zinc-700">
                <div className={`h-2 rounded ${levelClass(stat.percentage)}`} style={{ width: `${stat.percentage}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-500 dark:text-zinc-400">Kategori dagilimi verisi bulunamadi.</p>
        )}
      </div>
    </article>
  );
}

