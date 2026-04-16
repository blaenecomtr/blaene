import { DeviceStats } from '../components/dashboard/DeviceStats';
import { MetricCards } from '../components/dashboard/MetricCards';
import { NewMembers } from '../components/dashboard/NewMembers';
import { NotificationFeed } from '../components/dashboard/NotificationFeed';
import { RecentOrders } from '../components/dashboard/RecentOrders';
import { SalesFunnel } from '../components/dashboard/SalesFunnel';
import { TrafficChart } from '../components/dashboard/TrafficChart';
import { TrafficSources } from '../components/dashboard/TrafficSources';
import { Shell } from '../components/layout/Shell';

export default function Dashboard() {
  return (
    <Shell title="Dashboard">
      <div className="space-y-4">
        <MetricCards />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <TrafficChart />
          </div>
          <div className="space-y-4 xl:col-span-5">
            <TrafficSources />
            <SalesFunnel />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <NewMembers />
          </div>
          <div className="xl:col-span-4">
            <DeviceStats />
          </div>
          <div className="xl:col-span-4">
            <NotificationFeed />
          </div>
        </section>

        <RecentOrders />
      </div>
    </Shell>
  );
}
