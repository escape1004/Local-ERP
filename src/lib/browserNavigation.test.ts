import { expect, test } from 'vitest';
import { getInAppBrowserRoute, isStandaloneBrowserRole } from './browserNavigation';

test('builds an in-app browser route', () => {
  expect(getInAppBrowserRoute('https://example.com/a')).toBe('/browser?url=https%3A%2F%2Fexample.com%2Fa');
});

test('detects a standalone browser window from the role query', () => {
  expect(isStandaloneBrowserRole('?role=browser')).toBe(true);
  expect(isStandaloneBrowserRole('?role=main')).toBe(false);
  expect(isStandaloneBrowserRole('')).toBe(false);
});
