import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { useAdminContext } from '../../context/AdminContext';
import { formatCurrency, formatNumber } from '../../utils/format';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
  Filler
);

export function TrafficChart() {
  const { analytics, loadingData } = useAdminContext();
  const series = analytics?.charts?.daily_sales || [];

  if (loadingData && !series.length) {
    return (
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="mb-3 text-[12px] font-medium text-gray-900 dark:text-gray-100">Siparis ve Odenen Ciro</h2>
        <div className="h-72 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
      </article>
    );
  }

  if (!series.length) {
    return (
      <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Siparis serisi bulunamadi.
      </article>
    );
  }

  const labels = series.map((entry) =>
    new Date(entry.date).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
    })
  );
  const orderCounts = series.map((entry) => Number(entry.orders || 0));
  const paidRevenue = series.map((entry) => Number(entry.paid_revenue || 0));

  const data = {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Siparis',
        data: orderCounts,
        backgroundColor: '#3b82f6',
        borderRadius: 4,
        yAxisID: 'y',
        barThickness: 18,
      },
      {
        type: 'line' as const,
        label: 'Odenen Ciro',
        data: paidRevenue,
        borderColor: '#10b981',
        pointBackgroundColor: '#10b981',
        pointRadius: 3,
        tension: 0.35,
        fill: true,
        backgroundColor: 'rgba(16, 185, 129, 0.14)',
        yAxisID: 'y1',
      },
    ],
  };

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-medium text-gray-900 dark:text-gray-100">Siparis ve Odenen Ciro</h2>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1 text-gray-600 dark:text-zinc-300">
            <span className="h-2 w-2 rounded bg-blue-500" />
            Siparis
          </span>
          <span className="inline-flex items-center gap-1 text-gray-600 dark:text-zinc-300">
            <span className="h-2 w-2 rounded bg-emerald-500" />
            Odenen Ciro
          </span>
        </div>
      </div>

      <div className="h-72">
        <Chart
          type="bar"
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label(context) {
                    if (context.dataset.yAxisID === 'y1') {
                      return `${context.dataset.label}: ${formatCurrency(Number(context.parsed.y || 0))}`;
                    }
                    return `${context.dataset.label}: ${formatNumber(Number(context.parsed.y || 0))}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#6b7280', font: { size: 10 } },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  color: '#6b7280',
                  font: { size: 10 },
                  callback(value) {
                    return formatNumber(Number(value));
                  },
                },
              },
              y1: {
                beginAtZero: true,
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: {
                  color: '#6b7280',
                  font: { size: 10 },
                  callback(value) {
                    return formatCurrency(Number(value));
                  },
                },
              },
            },
          }}
        />
      </div>
    </article>
  );
}

