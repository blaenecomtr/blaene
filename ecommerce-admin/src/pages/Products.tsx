import { useAdminContext } from '../context/AdminContext';
import { Shell } from '../components/layout/Shell';
import { formatCurrency } from '../utils/format';

export default function Products() {
  const { products, loadingData } = useAdminContext();

  if (loadingData && !products.length) {
    return (
      <Shell title="Urunler">
        <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Stok Ozeti</h2>
          <div className="h-40 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
        </article>
      </Shell>
    );
  }

  return (
    <Shell title="Urunler">
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-zinc-100">Stok Ozeti</h2>
        {products.length === 0 ? (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">Urun bulunamadi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="text-gray-500 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Kod</th>
                  <th className="px-2 py-2 font-medium">Urun</th>
                  <th className="px-2 py-2 font-medium">Kategori</th>
                  <th className="px-2 py-2 font-medium">Stok</th>
                  <th className="px-2 py-2 font-medium">Fiyat</th>
                  <th className="px-2 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {products.map((item) => (
                  <tr key={item.id} className="border-t border-gray-200 text-gray-700 dark:border-zinc-700 dark:text-zinc-200">
                    <td className="px-2 py-2 font-medium">{item.code}</td>
                    <td className="px-2 py-2">{item.name}</td>
                    <td className="px-2 py-2 text-[10px] uppercase">{item.category}</td>
                    <td className="px-2 py-2">{item.stock_quantity ?? 'N/A'}</td>
                    <td className="px-2 py-2 font-medium">{formatCurrency(Number(item.price || 0))}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-block px-2 py-1 text-[10px] rounded ${item.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                        {item.active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
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
