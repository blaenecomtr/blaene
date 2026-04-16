import { DeviceStats } from '../components/dashboard/DeviceStats';
import { TrafficChart } from '../components/dashboard/TrafficChart';
import { TrafficSources } from '../components/dashboard/TrafficSources';
import { Shell } from '../components/layout/Shell';

export default function Traffic() {
  return (
    <Shell title="Site Trafigi">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrafficChart />
        </div>
        <div className="space-y-4">
          <TrafficSources />
          <DeviceStats />
        </div>
      </div>
    </Shell>
  );
}
