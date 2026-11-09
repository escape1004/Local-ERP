import { expect, test } from 'vitest';
import { getDashboardSummaryGridClass, hasDashboardRecords } from './dashboardLayout';

test('shows the empty-record prompt only when every category has zero records', () => {
  expect(hasDashboardRecords([{ recordCount: 0 }, { recordCount: 0 }])).toBe(false);
  expect(hasDashboardRecords([{ recordCount: 0 }, { recordCount: 2 }])).toBe(true);
});

test('uses a two-column grid for two summary cards so the third column is not left empty', () => {
  expect(getDashboardSummaryGridClass(1)).toBe('');
  expect(getDashboardSummaryGridClass(2)).toBe('md:grid-cols-2');
  expect(getDashboardSummaryGridClass(3)).toBe('md:grid-cols-2 lg:grid-cols-3');
  expect(getDashboardSummaryGridClass(4)).toBe('md:grid-cols-2 lg:grid-cols-4');
  expect(getDashboardSummaryGridClass(5)).toBe('md:grid-cols-2 lg:grid-cols-5');
});
