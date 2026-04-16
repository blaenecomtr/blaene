import { useAdminContext } from '../../context/AdminContext';
import { Avatar } from '../ui/Avatar';
import { StatusPill } from '../ui/StatusPill';

function tagTone(tier: string): 'success' | 'info' | 'warning' {
  if (tier === 'free') return 'success';
  if (tier === 'pro') return 'info';
  return 'warning';
}

function tierDisplay(tier?: string | null): string {
  if (tier === 'pro') return 'Ref.';
  if (tier === 'enterprise') return 'Kampanya';
  return 'Yeni';
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

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function NewMembers() {
  const { users, loadingData } = useAdminContext();
  const displayUsers = users.sort((a, b) => (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())).slice(0, 5);

  if (loadingData && !users.length) {
    return (
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Yeni Uyeler</h2>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Yeni Uyeler</h2>
      {displayUsers.length === 0 ? (
        <p className="text-[11px] text-gray-500 dark:text-zinc-400">Uye bulunamadi.</p>
      ) : (
        <ul className="space-y-2">
          {displayUsers.map((user, index) => (
            <li key={user.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <span className="inline-flex items-center gap-2">
                <Avatar initials={getInitials(user.full_name || '')} index={index} />
                <span>
                  <strong className="block text-[11px] font-medium text-gray-800 dark:text-zinc-100">{user.full_name || user.email}</strong>
                  <span className="text-[10px] text-gray-500 dark:text-zinc-400">{user.role} • {formatRelativeTime(user.created_at)}</span>
                </span>
              </span>
              <StatusPill label={tierDisplay(user.subscription_tier)} tone={tagTone(user.subscription_tier || '')} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
