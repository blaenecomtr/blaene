import { useAdminContext } from '../context/AdminContext';
import { Shell } from '../components/layout/Shell';
import { formatPercent } from '../utils/format';

export default function Campaigns() {
  const { promotions, loadingData } = useAdminContext();

  const getStatusLabel = (promo: any): string => {
    if (!promo.is_active) return 'Pasif';
    if (promo.starts_at && new Date(promo.starts_at) > new Date()) return 'Gelecek';
    if (promo.ends_at && new Date(promo.ends_at) < new Date()) return 'Sona Erdi';
    return 'Aktif';
  };

  const getUsagePercent = (promo: any): number => {
    if (!promo.usage_limit) return 0;
    return Math.round(((promo.usage_count || 0) / promo.usage_limit) * 100);
  };

  if (loadingData && !promotions.length) {
    return (
      <Shell title="Kampanyalar">
        <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Promosyon ve Indirimler</h2>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
            ))}
          </div>
        </article>
      </Shell>
    );
  }

  return (
    <Shell title="Kampanyalar">
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Promosyon ve Indirimler</h2>
        {promotions.length === 0 ? (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">Promosyon bulunamadi.</p>
        ) : (
          <ul className="space-y-2 text-[11px]">
            {promotions.map((campaign) => (
              <li key={campaign.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex-1">
                  <span className="block font-medium text-gray-700 dark:text-zinc-200">{campaign.code}</span>
                  <span className="text-[10px] text-gray-500 dark:text-zinc-400">{campaign.title}</span>
                </div>
                <span className="text-gray-500 dark:text-zinc-400">
                  {getStatusLabel(campaign)} • {campaign.discount_type === 'percent' ? formatPercent(Number(campaign.discount_value || 0)) : `₺${campaign.discount_value}`} • {getUsagePercent(campaign)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </Shell>
  );
}
