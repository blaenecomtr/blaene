import { supabase } from './supabase-client.js';

const TOKEN_STORAGE_KEY = 'blaene_admin_access_token';
const THEME_STORAGE_KEY = 'blaene_admin_theme';
let sessionWatcherStarted = false;

function isSessionExpired(session) {
  const expiresAtSec = Number(session?.expires_at || 0);
  if (!Number.isFinite(expiresAtSec) || expiresAtSec <= 0) return false;
  return Date.now() >= (expiresAtSec * 1000);
}

async function forceLogoutWithNotice(message = 'Oturum suresi doldu. Lutfen tekrar giris yapin.') {
  showToast(message, 'warning');
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  await supabase?.auth?.signOut().catch(() => null);
  setTimeout(() => {
    location.replace('./index.html');
  }, 150);
}

function ensureSessionWatcher() {
  if (sessionWatcherStarted || !supabase) return;
  sessionWatcherStarted = true;
  setInterval(async () => {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
    const session = data?.session || null;
    if (!session) return;
    if (isSessionExpired(session)) {
      await forceLogoutWithNotice();
    }
  }, 30000);
}

function getTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
}

function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
}

export function initThemeToggle() {
  setTheme(getTheme());
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || document.getElementById('theme-toggle-btn')) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'theme-toggle-btn';
  button.className = 'btn small';
  button.type = 'button';
  button.style.marginTop = '0.55rem';
  button.textContent = getTheme() === 'light' ? 'Dark moda gec' : 'Light moda gec';
  button.addEventListener('click', () => {
    const current = getTheme();
    const next = current === 'light' ? 'dark' : 'light';
    setTheme(next);
    button.textContent = next === 'light' ? 'Dark moda gec' : 'Light moda gec';
  });
  sidebar.appendChild(button);
}

export function showToast(message, type = 'success') {
  if (!message) return;
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  host.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 240);
  }, 2600);
}

export async function checkAuth(options = {}) {
  const redirectTo = options.redirectTo || './index.html';
  const requiredRoles = Array.isArray(options.requiredRoles) ? options.requiredRoles : [];
  const requiredTier = options.requiredTier || '';

  if (!supabase) {
    return {
      ok: false,
      reason: 'supabase_not_configured',
    };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    if (options.redirect !== false) {
      location.replace(redirectTo);
    }
    return {
      ok: false,
      reason: 'session_missing',
    };
  }

  const accessToken = data.session.access_token;
  if (isSessionExpired(data.session)) {
    await forceLogoutWithNotice();
    return {
      ok: false,
      reason: 'session_expired',
    };
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  ensureSessionWatcher();

  const meResponse = await fetch('/api/admin/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const meData = await meResponse.json().catch(() => null);
  if (!meResponse.ok || !meData?.success) {
    const sessionUser = data?.session?.user || null;
    const fallbackProfile = {
      id: sessionUser?.id || null,
      email: sessionUser?.email || null,
      role: 'viewer',
      subscription_tier: 'free',
      is_active: true,
    };
    showToast('Profil servisine ulasilamadi. Guvenli temel modda devam ediliyor.', 'warning');
    return {
      ok: true,
      token: accessToken,
      session: data.session,
      user: sessionUser,
      profile: fallbackProfile,
      degraded: true,
    };
  }

  const profile = meData.data?.profile || {};
  const role = String(profile.role || '').toLowerCase();
  const tier = String(profile.subscription_tier || 'free').toLowerCase();

  if (requiredRoles.length && !requiredRoles.includes(role)) {
    showToast('Bu sayfaya erisim yetkiniz yok.', 'error');
    location.replace('./dashboard.html');
    return { ok: false, reason: 'role_forbidden' };
  }

  if (requiredTier) {
    const rank = { free: 1, pro: 2, enterprise: 3 };
    const needed = rank[requiredTier] || 1;
    const current = rank[tier] || 1;
    if (current < needed) {
      showToast(`Bu alan icin en az ${requiredTier} paket gerekir.`, 'warning');
      location.replace('./dashboard.html');
      return { ok: false, reason: 'tier_forbidden' };
    }
  }

  return {
    ok: true,
    token: accessToken,
    session: data.session,
    user: meData.data?.user || null,
    profile,
  };
}

export async function apiFetch(path, options = {}, authState = null) {
  const token = authState?.token || localStorage.getItem(TOKEN_STORAGE_KEY);
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(path, {
    ...options,
    headers,
  });
  if (response.status === 401) {
    await forceLogoutWithNotice();
  }
  const data = await response.json().catch(() => null);
  return {
    response,
    data,
  };
}

export function attachLogoutHandler(buttonSelector = '#logout-btn') {
  const button = document.querySelector(buttonSelector);
  if (!button || !supabase) return;
  button.addEventListener('click', async () => {
    await supabase.auth.signOut().catch(() => null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    location.replace('./index.html');
  });
}
