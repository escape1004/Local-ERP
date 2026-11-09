export function hasDashboardRecords(stats: Array<{ recordCount: number }>): boolean {
  return stats.some((stat) => stat.recordCount > 0);
}

export function getDashboardSummaryGridClass(cardCount: number): string {
  if (cardCount >= 5) return 'md:grid-cols-2 lg:grid-cols-5';
  if (cardCount === 4) return 'md:grid-cols-2 lg:grid-cols-4';
  if (cardCount === 2) return 'md:grid-cols-2';
  if (cardCount === 1) return '';
  return 'md:grid-cols-2 lg:grid-cols-3';
}
