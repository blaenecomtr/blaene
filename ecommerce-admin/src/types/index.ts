export type TrendDirection = 'up' | 'down' | 'flat';

export interface MetricCardData {
  id: string;
  label: string;
  value: string;
  deltaText: string;
  deltaDirection: TrendDirection;
}

export interface TrafficSeries {
  days: string[];
  visitors: number[];
  revenueHundreds: number[];
}

export interface TrafficSource {
  id: string;
  name: string;
  percentage: number;
  trend: TrendDirection;
  trendText: string;
  colorClass: string;
}

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

export type MemberTag = 'Yeni' | 'Ref.' | 'Kampanya';

export interface NewMember {
  initials: string;
  name: string;
  source: string;
  timeAgo: string;
  tag: MemberTag;
}

export interface DeviceStat {
  label: string;
  percentage: number;
}

export interface PageSpeedStat {
  page: string;
  seconds: number;
}

export type OrderStatus = 'Tamam' | 'Kargoda' | 'Bekliyor' | 'Iptal';

export interface RecentOrder {
  id: string;
  customer: string;
  channel: string;
  amount: number;
  status: OrderStatus;
  time: string;
}

export type NotificationTone = 'danger' | 'warning' | 'success' | 'info';

export interface NotificationItem {
  id: string;
  color: NotificationTone;
  text: string;
  timeAgo: string;
}

export interface SidebarItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  badge?: {
    text: string;
    tone: 'success' | 'warning' | 'danger' | 'info';
  };
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}
