import { formatNumber } from '../../lib/dashboardStats';

export function DashboardChartTooltip({ active, payload, label, labelFormatter }: any) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;
  const value = payload[0].value;
  const displayLabel = labelFormatter ? labelFormatter(label, payload) : (data?.fullName || data?.name || label);

  return (
    <div
      style={{
        backgroundColor: '#2F3136',
        border: '1px solid #40444B',
        borderRadius: '4px',
        padding: '8px 12px',
        color: '#FFFFFF',
      }}
    >
      {displayLabel && (
        <div style={{ marginBottom: '4px', color: '#FFFFFF', fontWeight: 500 }}>
          {displayLabel}
        </div>
      )}
      <div style={{ color: '#FFFFFF' }}>개수: {formatNumber(value)}</div>
    </div>
  );
}
