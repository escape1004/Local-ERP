import { expect, test } from 'vitest';
import { wrapUserscript, wrapUserscriptForRunAt } from './browser-userscript';

test('wraps userscript source in an isolated try/catch', () => {
  expect(wrapUserscript('window.flag = 1;')).toContain('window.flag = 1;');
  expect(wrapUserscript('window.flag = 1;')).toContain("console.error('[ERP userscript]', error)");
});

test('schedules document-idle scripts without a long delay', () => {
  const idle = wrapUserscriptForRunAt('window.flag = 1;', 'document-idle');
  expect(idle).toContain('requestIdleCallback');
  expect(idle).toContain('timeout:50');
  expect(wrapUserscriptForRunAt('window.flag = 1;', 'document-end')).toBe(wrapUserscript('window.flag = 1;'));
});
