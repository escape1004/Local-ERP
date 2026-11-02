import { expect, test } from 'vitest';
import { getInAppBrowserRoute, parseExternalHttpUrl } from './browserNavigation';

test('accepts typed hosts by prefixing https', () => {
  expect(parseExternalHttpUrl('www.youtube.com/feed/subscriptions')?.toString())
    .toBe('https://www.youtube.com/feed/subscriptions');
  expect(parseExternalHttpUrl('javascript:alert(1)')).toBeNull();
});

test('builds the in-app browser route', () => {
  expect(getInAppBrowserRoute('https://example.com/a')).toBe('/browser?url=https%3A%2F%2Fexample.com%2Fa');
});
