import { useAdminContext } from '../../context/AdminContext';
import { formatCurrency } from '../../utils/format';
import { StatusPill } from '../ui/StatusPill';

function statusTone(status: string): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'paid') return 'success';
  if (status === 'shipped') return 'info';
  if (status === 'pending') return 'warning';
  return 'danger';
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'az once';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}d once`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}s once`;
  return `${Math.floor(seconds / 86400)}g once`;
}

export function RecentOrders() {
  const { orders, loadingData } = useAdminContext();
  const displayOrders = orders.slice(0, 10);

  if (loadingData && !orders.length) {
    return (
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Son Siparisler</h2>
        <div className="h-40 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Son Siparisler</h2>
      {displayOrders.length === 0 ? (
        <p className="text-[11px] text-gray-500 dark:text-zinc-400">Siparis bulunamadi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-1 text-left text-[11px]">
            <thead>
              <tr className="text-gray-500 dark:text-zinc-400">
                <th className="px-2 py-1 font-medium">No</th>
                <th className="px-2 py-1 font-medium">Musteri</th>
                <th className="px-2 py-1 font-medium">Kanal</th>
                <th className="px-2 py-1 font-medium">Tutar</th>
                <th className="px-2 py-1 font-medium">Durum</th>
                <th className="px-2 py-1 font-medium">Sure</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map((order) => (
                <tr key={order.id} className="rounded-lg bg-white text-gray-700 dark:bg-zinc-900 dark:text-zinc-200">
                  <td className="rounded-l-lg px-2 py-2">{order.order_no?.slice(-4)}</td>
                  <td className="px-2 py-2">{order.customer_name}</td>
                  <td className="px-2 py-2">Web</td>
                  <td className="px-2 py-2">{formatCurrency(Number(order.total || 0))}</td>
                  <td className="px-2 py-2">
                    <StatusPill label={order.payment_status || 'pending'} tone={statusTone(order.payment_status || '')} />
                  </td>
                  <td className="rounded-r-lg px-2 py-2">{formatRelativeTime(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
