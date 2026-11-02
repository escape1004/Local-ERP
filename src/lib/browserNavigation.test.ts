import { expect, test } from 'vitest';
import { getInAppBrowserRoute, isStandaloneBrowserRole, resolveBrowserAddressInput } from './browserNavigation';

test('builds an in-app browser route', () => {
  expect(getInAppBrowserRoute('https://example.com/a')).toBe('/browser?url=https%3A%2F%2Fexample.com%2Fa');
});

test('treats non-url address bar input as a Google search', () => {
  expect(resolveBrowserAddressInput('hello')).toBe('https://www.google.com/search?q=hello');
  expect(resolveBrowserAddressInput('react query')).toBe(
    'https://www.google.com/search?q=react%20query',
  );
  expect(resolveBrowserAddressInput('한글검색')).toBe(
    'https://www.google.com/search?q=%ED%95%9C%EA%B8%80%EA%B2%80%EC%83%89',
  );
  expect(resolveBrowserAddressInput('localhost:3000')).toBe('https://localhost:3000/');
  expect(resolveBrowserAddressInput('example.com/path')).toBe('https://example.com/path');
  expect(resolveBrowserAddressInput('https://example.com')).toBe('https://example.com/');
  expect(resolveBrowserAddressInput('javascript:alert(1)')).toBeNull();
});

test('detects a standalone browser window from the role query', () => {
  expect(isStandaloneBrowserRole('?role=browser')).toBe(true);
  expect(isStandaloneBrowserRole('?role=main')).toBe(false);
  expect(isStandaloneBrowserRole('')).toBe(false);
});
