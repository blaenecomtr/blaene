import { useMemo } from 'react';
import { useAdminContext } from '../../context/AdminContext';

const colorMap = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  info: 'bg-blue-500',
} as const;

interface NotificationItem {
  id: string;
  color: keyof typeof colorMap;
  text: string;
  timeAgo: string;
}

export function NotificationFeed() {
  const { orders, products, analytics } = useAdminContext();

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];

    // Low stock products
    const lowStockProducts = products.filter((p) => p.stock_quantity && p.stock_threshold && p.stock_quantity <= p.stock_threshold);
    if (lowStockProducts.length > 0) {
      items.push({
        id: 'low-stock',
        color: 'danger',
        text: `${lowStockProducts.length} ürünün stok kritik seviye altında`,
        timeAgo: 'Şimdi',
      });
    }

    // Pending orders
    const pendingOrders = orders.filter((o) => o.status === 'pending').length;
    if (pendingOrders > 0) {
      items.push({
        id: 'pending-orders',
        color: 'warning',
        text: `${pendingOrders} sipariş bekleme durumunda`,
        timeAgo: 'Şimdi',
      });
    }

    // Failed payments
    const failedPayments = orders.filter((o) => o.payment_status === 'failed').length;
    if (failedPayments > 0) {
      items.push({
        id: 'failed-payments',
        color: 'danger',
        text: `${failedPayments} siparişin ödemesi başarısız oldu`,
        timeAgo: 'Şimdi',
      });
    }

    // Open support tickets
    const openTickets = analytics?.metrics?.open_support_tickets || 0;
    if (openTickets > 0) {
      items.push({
        id: 'support-tickets',
        color: 'info',
        text: `${openTickets} açık destek talebi var`,
        timeAgo: 'Şimdi',
      });
    }

    // If no notifications, show "Yeni bildirim yok"
    if (items.length === 0) {
      items.push({
        id: 'no-notifications',
        color: 'success',
        text: 'Yeni bildirim bulunmamaktadır',
        timeAgo: '—',
      });
    }

    return items;
  }, [orders, products, analytics]);

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Bildirimler ve Uyarilar</h2>
      <ul className="space-y-2">
        {notifications.map((item) => (
          <li key={item.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
            <div className="inline-flex items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colorMap[item.color]}`} />
              <span>
                <span className="block text-gray-700 dark:text-zinc-200">{item.text}</span>
                <span className="mt-0.5 block text-[10px] text-gray-500 dark:text-zinc-400">{item.timeAgo}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
