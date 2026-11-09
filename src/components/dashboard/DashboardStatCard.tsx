import type { ReactNode } from 'react';
import { formatNumber } from '../../lib/dashboardStats';

export function DashboardStatCard({
  title,
  value,
  icon,
  color = 'bg-discord-accent',
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-discord-sidebar rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-discord-muted mb-1">{title}</p>
          <p className="text-2xl font-bold text-discord-text">{typeof value === 'number' ? formatNumber(value) : value}</p>
        </div>
        <div className={`${color} p-3 rounded-lg`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
