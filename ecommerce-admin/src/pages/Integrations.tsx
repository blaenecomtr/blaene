import { useAdminContext } from '../context/AdminContext';
import { Shell } from '../components/layout/Shell';

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'asla';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'az once';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}d once`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}s once`;
  return `${Math.floor(seconds / 86400)}g once`;
}

function getStatusColor(isActive: boolean | null | undefined): string {
  return isActive ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-600 dark:text-gray-400';
}

function getStatusLabel(isActive: boolean | null | undefined): string {
  return isActive ? 'Bagli' : 'Kesik';
}

export default function Integrations() {
  const { connections, loadingData } = useAdminContext();

  if (loadingData && !connections.length) {
    return (
      <Shell title="Entegrasyonlar">
        <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Baglanti Durumu</h2>
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
    <Shell title="Entegrasyonlar">
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Baglanti Durumu</h2>
        {connections.length === 0 ? (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">Entegrasyon bulunamadi.</p>
        ) : (
          <ul className="space-y-2 text-[11px]">
            {connections.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="text-gray-700 dark:text-zinc-200">{item.display_name || item.provider}</span>
                <span className={getStatusColor(item.is_active)}>
                  {getStatusLabel(item.is_active)} • Son senk: {formatRelativeTime(item.last_sync_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </Shell>
  );
}
