import { useAdminContext } from '../context/AdminContext';
import { useUiStore } from '../store/uiStore';
import { Shell } from '../components/layout/Shell';

export default function Settings() {
  const { profile } = useAdminContext();
  const openLogoutModal = useUiStore((state) => state.openLogoutModal);

  return (
    <Shell title="Ayarlar">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Profil Bilgileri</h2>
          {profile ? (
            <div className="space-y-2 text-[11px]">
              <div>
                <p className="text-gray-500 dark:text-zinc-400">Ad Soyad</p>
                <p className="font-medium text-gray-900 dark:text-zinc-100">{profile.full_name || 'Belirtilmemis'}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-zinc-400">E-posta</p>
                <p className="font-medium text-gray-900 dark:text-zinc-100">{profile.email}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-zinc-400">Rol</p>
                <p className="inline-block rounded bg-blue-100 px-2 py-1 font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                  {profile.role || 'viewer'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-zinc-400">Paket</p>
                <p className="capitalize font-medium text-gray-900 dark:text-zinc-100">{profile.subscription_tier || 'free'}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-zinc-400">Durum</p>
                <p className={`font-medium ${profile.is_active ? 'text-emerald-700 dark:text-emerald-200' : 'text-red-700 dark:text-red-200'}`}>
                  {profile.is_active ? 'Aktif' : 'Pasif'}
                </p>
              </div>
              <div className="border-t border-gray-200 pt-3 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={openLogoutModal}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30 transition"
                >
                  Çıkış Yap
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-zinc-400">Profil bilgisi yüklenmedi.</p>
          )}
        </article>

        <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-[11px] dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-2 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Sistem Ayarlari</h2>
          <p className="text-gray-600 dark:text-zinc-300">
            Admin paneli API ile baglanmistir. Tum veriler ozel olarak guncellenmektedir.
          </p>
          <ul className="mt-3 space-y-2 text-[10px]">
            <li className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-gray-700 dark:text-zinc-300">Oturum yonetimi aktif</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-gray-700 dark:text-zinc-300">Rol tabanlı erisim kontrolu</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-gray-700 dark:text-zinc-300">Denetim kayitlari kaydediliyor</span>
            </li>
          </ul>
        </article>
      </div>
    </Shell>
  );
}
