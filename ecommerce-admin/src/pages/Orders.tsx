import { useState } from 'react';
import { useAdminContext } from '../context/AdminContext';
import { Shell } from '../components/layout/Shell';
import { formatCurrency } from '../utils/format';

function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { bg: string; text: string }> = {
    paid: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300' },
    pending: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-700 dark:text-yellow-300' },
    failed: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300' },
  };

  const style = statusMap[status] || statusMap.pending;

  const labelMap: Record<string, string> = {
    paid: 'Ödendi',
    pending: 'Bekliyor',
    failed: 'Başarısız',
  };

  return (
    <span className={`inline-block rounded-full px-2 py-1 text-[10px] font-medium ${style.bg} ${style.text}`}>
      {labelMap[status] || status}
    </span>
  );
}

function RelativeTime({ isoDate }: { isoDate: string | undefined }) {
  if (!isoDate) return <span>-</span>;
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return <span>Az önce</span>;
    if (diff < 3600000) return <span>{Math.floor(diff / 60000)}d önce</span>;
    if (diff < 86400000) return <span>{Math.floor(diff / 3600000)}s önce</span>;
    if (diff < 604800000) return <span>{Math.floor(diff / 86400000)}g önce</span>;
    return <span>{date.toLocaleDateString('tr-TR')}</span>;
  } catch {
    return <span>{isoDate.slice(0, 10)}</span>;
  }
}

export default function Orders() {
  const { orders, loadingData } = useAdminContext();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = orders
    .filter((o) => statusFilter === 'all' || o.payment_status === statusFilter)
    .filter((o) => {
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        o.customer_name?.toLowerCase().includes(query) ||
        o.order_no?.toLowerCase().includes(query) ||
        o.email?.toLowerCase().includes(query)
      );
    });

  return (
    <Shell title="Siparisler">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            {['all', 'paid', 'pending', 'failed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {{
                  all: 'Tümü',
                  paid: 'Ödendi',
                  pending: 'Bekliyor',
                  failed: 'Başarısız',
                }[status]}
              </button>
            ))}
          </div>

          <div className="relative md:w-64">
            <input
              type="text"
              placeholder="Müşteri adı, sipariş no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Orders Table */}
        {loadingData && orders.length === 0 ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Sipariş bulunamadı.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800">
                  <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-zinc-100">Sipariş No</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-zinc-100">Müşteri</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-zinc-100">E-posta</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-900 dark:text-zinc-100">Toplam</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-zinc-100">Durum</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-zinc-100">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-zinc-100">{order.order_no || '-'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{order.customer_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-zinc-300">{order.email || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-zinc-100">
                      {order.total !== null && order.total !== undefined ? formatCurrency(order.total) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.payment_status || 'pending'} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-zinc-400">
                      <RelativeTime isoDate={order.created_at ?? undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-zinc-400">
          {filtered.length} sipariş gösteriliyor
        </div>
      </div>
    </Shell>
  );
}
