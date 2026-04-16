import { type FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdminContext } from '../../context/AdminContext';
import { useUiStore } from '../../store/uiStore';

export function LogoutModal() {
  const { profile, signOut } = useAdminContext();
  const logoutModalOpen = useUiStore((state) => state.logoutModalOpen);
  const closeLogoutModal = useUiStore((state) => state.closeLogoutModal);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!logoutModalOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile?.email || !password) {
      setError('Lütfen şifrenizi girin.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Şifre doğrulaması için Supabase'de re-auth yap
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

      if (authError) {
        console.error('Auth error:', authError);
        setError('Şifre yanlış veya oturum hatası. Tekrar deneyin.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
          Çıkışı Onayla
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
          Devam etmek için şifrenizi girin.
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            autoFocus
            disabled={loading}
          />

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
