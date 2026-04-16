import type {
  DeviceStat,
  FunnelStep,
  MetricCardData,
  NewMember,
  NotificationItem,
  PageSpeedStat,
  RecentOrder,
  SidebarSection,
  TrafficSeries,
  TrafficSource,
} from '../types';

export const metricCards: MetricCardData[] = [
  {
    id: 'revenue',
    label: 'Bugunku Gelir',
    value: '₺24.810',
    deltaText: '↑ %18 dun\'e gore',
    deltaDirection: 'up',
  },
  {
    id: 'visitors',
    label: 'Gunluk Ziyaretci',
    value: '3.247',
    deltaText: '↑ %11 dun\'e gore',
    deltaDirection: 'up',
  },
  {
    id: 'members',
    label: 'Yeni Uye',
    value: '128',
    deltaText: '↑ %22 bu hafta',
    deltaDirection: 'up',
  },
  {
    id: 'conversion',
    label: 'Donusum Orani',
    value: '%3.8',
    deltaText: '↓ %0.3 dun\'e gore',
    deltaDirection: 'down',
  },
];

export const trafficSeries: TrafficSeries = {
  days: ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz'],
  visitors: [2100, 2450, 1980, 3100, 2870, 3900, 3247],
  revenueHundreds: [148, 182, 131, 224, 198, 310, 248],
};

export const trafficSources: TrafficSource[] = [
  { id: 'organic', name: 'Organik Arama', percentage: 38, trend: 'up', trendText: '↑4%', colorClass: 'bg-emerald-500' },
  { id: 'trendyol', name: 'Trendyol Ref.', percentage: 24, trend: 'up', trendText: '↑2%', colorClass: 'bg-blue-500' },
  { id: 'social', name: 'Sosyal Medya', percentage: 19, trend: 'down', trendText: '↓1%', colorClass: 'bg-fuchsia-500' },
  { id: 'direct', name: 'Dogrudan', percentage: 12, trend: 'flat', trendText: '→', colorClass: 'bg-slate-500' },
  { id: 'email', name: 'E-posta', percentage: 7, trend: 'up', trendText: '↑1%', colorClass: 'bg-amber-500' },
];

export const salesFunnel: FunnelStep[] = [
  { id: 'visit', label: 'Ziyaret', count: 3247, percentage: 100 },
  { id: 'view', label: 'Urun Goruntuleme', count: 2338, percentage: 72 },
  { id: 'cart', label: 'Sepete Ekle', count: 1006, percentage: 31 },
  { id: 'checkout', label: 'Odemeye Gec', count: 454, percentage: 14 },
  { id: 'done', label: 'Tamamlandi', count: 292, percentage: 9 },
];

export const newMembers: NewMember[] = [
  { initials: 'AY', name: 'Ayse Yilmaz', source: 'Organik', timeAgo: '12 dk once', tag: 'Yeni' },
  { initials: 'MK', name: 'Mehmet Kaya', source: 'Instagram', timeAgo: '28 dk once', tag: 'Ref.' },
  { initials: 'FD', name: 'Fatma Demir', source: 'E-posta', timeAgo: '45 dk once', tag: 'Kampanya' },
  { initials: 'ZA', name: 'Zeynep Arslan', source: 'Trendyol Ref.', timeAgo: '1 sa once', tag: 'Yeni' },
  { initials: 'CR', name: 'Can Ruzgar', source: 'Google', timeAgo: '2 sa once', tag: 'Yeni' },
];

export const deviceStats: DeviceStat[] = [
  { label: 'Mobil', percentage: 68 },
  { label: 'Masaustu', percentage: 27 },
  { label: 'Tablet', percentage: 5 },
];

export const pageSpeedStats: PageSpeedStat[] = [
  { page: 'Ana Sayfa', seconds: 1.2 },
  { page: 'Urun Listesi', seconds: 1.8 },
  { page: 'Odeme', seconds: 3.4 },
];

export const recentOrders: RecentOrder[] = [
  { id: '#4201', customer: 'Ayse Y.', channel: 'Trendyol', amount: 420, status: 'Kargoda', time: '5dk' },
  { id: '#4200', customer: 'Ali R.', channel: 'Web', amount: 185, status: 'Tamam', time: '12dk' },
  { id: '#4199', customer: 'Selin K.', channel: 'Hepsi.', amount: 890, status: 'Bekliyor', time: '18dk' },
  { id: '#4198', customer: 'Ozan T.', channel: 'Etsy', amount: 240, status: 'Tamam', time: '34dk' },
  { id: '#4197', customer: 'Nil A.', channel: 'Web', amount: 67, status: 'Iptal', time: '1sa' },
];

export const notifications: NotificationItem[] = [
  {
    id: 'n1',
    color: 'danger',
    text: 'Trendyol API token suresi dolmak uzere - 2 gun kaldi.',
    timeAgo: '15 dk once',
  },
  {
    id: 'n2',
    color: 'warning',
    text: 'Deri Cuzdan stoku kritik seviye - 3 adet kaldi.',
    timeAgo: '42 dk once',
  },
  {
    id: 'n3',
    color: 'success',
    text: 'Anneler Gunu kampanyasi basladi - 128 tiklama.',
    timeAgo: '1 sa once',
  },
  {
    id: 'n4',
    color: 'info',
    text: 'Bu hafta 128 yeni uye - gecen haftaya gore +%22.',
    timeAgo: '3 sa once',
  },
  {
    id: 'n5',
    color: 'warning',
    text: 'Odeme sayfasi yukleme suresi 3.4s - esik asildi.',
    timeAgo: '5 sa once',
  },
];

export const sidebarSections: SidebarSection[] = [
  {
    title: 'Genel Bakis',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' },
      {
        id: 'traffic',
        label: 'Site Trafigi',
        path: '/traffic',
        icon: 'traffic',
        badge: { text: 'Canli', tone: 'success' },
      },
      {
        id: 'members',
        label: 'Uyeler',
        path: '/members',
        icon: 'members',
        badge: { text: '+18', tone: 'success' },
      },
    ],
  },
  {
    title: 'Satis',
    items: [
      {
        id: 'orders',
        label: 'Siparisler',
        path: '/orders',
        icon: 'orders',
        badge: { text: '12', tone: 'danger' },
      },
      { id: 'products', label: 'Urunler', path: '/products', icon: 'products' },
      {
        id: 'campaigns',
        label: 'Kampanyalar',
        path: '/campaigns',
        icon: 'campaigns',
        badge: { text: '3', tone: 'warning' },
      },
    ],
  },
  {
    title: 'Pazaryeri',
    items: [
      {
        id: 'integrations',
        label: 'Entegrasyonlar',
        path: '/integrations',
        icon: 'integrations',
        badge: { text: '!', tone: 'warning' },
      },
      { id: 'reports', label: 'Raporlar', path: '/reports', icon: 'reports' },
    ],
  },
  {
    title: 'Sistem',
    items: [{ id: 'settings', label: 'Ayarlar', path: '/settings', icon: 'settings' }],
  },
];

export const demoSearchTerms = ['siparis', 'uye', 'kampanya', 'stok', 'trendyol'];
