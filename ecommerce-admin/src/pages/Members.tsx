import { useAdminContext } from '../context/AdminContext';
import { Shell } from '../components/layout/Shell';
import { formatNumber } from '../utils/format';

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'az once';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}d once`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}s once`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}g once`;
  return `${Math.floor(seconds / 604800)}h once`;
}

export default function Members() {
  const { users, loadingData, usersAccessDenied } = useAdminContext();
  const activeUsers = users.filter((u) => u.is_active).length;
  const weekAgoDate = new Date();
  weekAgoDate.setDate(weekAgoDate.getDate() - 7);
  const newUsersThisWeek = users.filter((u) => new Date(u.created_at || 0) >= weekAgoDate).length;

  if (usersAccessDenied) {
    return (
      <Shell title="Uyeler">
        <article className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-[12px] font-medium text-red-700 dark:text-red-200">Erisim Reddedildi</p>
          <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">Bu sayfaya erisim icin yeterli yetkilere sahip degilsiniz.</p>
        </article>
      </Shell>
    );
  }

  const memberSummary = [
    { title: 'Toplam Uye', value: formatNumber(users.length) },
    { title: 'Bu Hafta Yeni', value: formatNumber(newUsersThisWeek) },
    { title: 'Aktif Uye', value: formatNumber(activeUsers) },
  ];

  return (
    <Shell title="Uyeler">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {memberSummary.map((item) => (
          <article key={item.title} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-[11px] text-gray-500 dark:text-zinc-400">{item.title}</p>
            <p className="mt-1 text-[20px] font-medium text-gray-900 dark:text-zinc-100">{item.value}</p>
          </article>
        ))}
      </section>

      <article className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Yonetici Uyeler</h2>
        {loadingData && !users.length ? (
          <div className="h-40 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
        ) : users.length === 0 ? (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">Uye bulunamadi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="text-gray-500 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Ad</th>
                  <th className="px-2 py-2 font-medium">E-posta</th>
                  <th className="px-2 py-2 font-medium">Rol</th>
                  <th className="px-2 py-2 font-medium">Paket</th>
                  <th className="px-2 py-2 font-medium">Durum</th>
                  <th className="px-2 py-2 font-medium">Son Erisim</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-zinc-200">
                    <td className="px-2 py-2 font-medium">{user.full_name || '-'}</td>
                    <td className="px-2 py-2 text-[10px]">{user.email}</td>
                    <td className="px-2 py-2 uppercase text-[10px]">{user.role || 'viewer'}</td>
                    <td className="px-2 py-2 capitalize text-[10px]">{user.subscription_tier || 'free'}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-block px-2 py-1 text-[10px] rounded ${user.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                        {user.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[10px]">{formatRelativeTime(user.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </Shell>
  );
}
