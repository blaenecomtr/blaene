import { type FormEvent, useState } from 'react';
import { useAdminContext } from '../../context/AdminContext';
import { useUiStore } from '../../store/uiStore';

export function LogoutModal() {
  const { signOut } = useAdminContext();
  const logoutModalOpen = useUiStore((state) => state.logoutModalOpen);
  const closeLogoutModal = useUiStore((state) => state.closeLogoutModal);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!logoutModalOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Lütfen şifrenizi girin.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Admin paneli API'sine şifre doğrulama isteği gönder
      const response = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('blaene_admin_access_token')}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError('Şifre yanlış. Tekrar deneyin.');
        setPassword('');
        setLoading(false);
        return;
      }

      // Doğrulama başarılı, çıkış yap
      await signOut();
      setPassword('');
      closeLogoutModal();
    } catch (err) {
      console.error('Logout error:', err);
      setError('Bir hata oluştu. Tekrar deneyin.');
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError(null);
    closeLogoutModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleCancel}
      onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
          Çıkışı Onayla
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
          Devam etmek için yönetici şifresini girin.
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="logout-password" className="block text-xs font-medium text-gray-600 dark:text-zinc-300 mb-1">
              Şifre
            </label>
            <input
              id="logout-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-400"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {loading ? 'Kontrol ediliyor...' : 'Çıkış Yap'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
