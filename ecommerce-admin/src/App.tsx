import { type FormEvent, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAdminContext } from './context/AdminContext';
import Campaigns from './pages/Campaigns';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import Members from './pages/Members';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Traffic from './pages/Traffic';
import { useUiStore } from './store/uiStore';

function LoadingView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-gray-700 dark:bg-zinc-900 dark:text-zinc-200">
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm dark:border-zinc-700 dark:bg-zinc-800">
        Admin panel yukleniyor...
      </div>
    </div>
  );
}

interface LoginViewProps {
  errorMessage: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
}

function LoginView({ errorMessage, onSubmit }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await onSubmit(email.trim(), password);
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 text-gray-900 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <h1 className="text-lg font-semibold">Blaene Admin Giris</h1>
        <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
          Admin paneli icin e-posta ve sifre ile giris yapin.
        </p>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-xs">
            <span className="text-gray-600 dark:text-zinc-300">E-posta</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="admin@blaene.com"
            />
          </label>

          <label className="block space-y-1 text-xs">
            <span className="text-gray-600 dark:text-zinc-300">Sifre</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                tabIndex={-1}
                aria-label={showPassword ? 'Sifreyi gizle' : 'Sifreyi goster'}
              >
                {showPassword ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? 'Giris yapiliyor...' : 'Giris yap'}
          </button>
        </form>

        {errorMessage ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/traffic" element={<Traffic />} />
      <Route path="/members" element={<Members />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/products" element={<Products />} />
      <Route path="/campaigns" element={<Campaigns />} />
      <Route path="/integrations" element={<Integrations />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function mapLoginError(raw: string): string {
  if (/invalid.*credentials/i.test(raw)) return 'E-posta veya sifre yanlis.';
  if (/email.*not.*confirmed/i.test(raw)) return 'E-posta adresiniz dogrulanmamis.';
  if (/too.*many.*requests/i.test(raw)) return 'Cok fazla deneme. Lutfen bekleyin.';
  return 'Giris yapilamamistir. Tekrar deneyin.';
}

export default function App() {
  const theme = useUiStore((state) => state.theme);
  const { authStatus, authError, dataError, signIn } = useAdminContext();
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSignIn = async (email: string, password: string) => {
    setLoginError(null);
    const result = await signIn(email, password);
    if (!result.ok) {
      setLoginError(mapLoginError(result.error || 'Bilinmeyen hata'));
    }
  };

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      {authStatus === 'loading' ? <LoadingView /> : null}
      {authStatus !== 'loading' && authStatus !== 'ready' ? (
        <LoginView errorMessage={loginError || authError} onSubmit={handleSignIn} />
      ) : null}
      {authStatus === 'ready' ? (
        <>
          {dataError ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Veri servislerinden bazilarina ulasilamadi: {dataError}
            </div>
          ) : null}
          <AppRoutes />
        </>
      ) : null}
    </div>
  );
}

