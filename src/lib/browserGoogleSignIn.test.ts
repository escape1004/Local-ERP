import { expect, test } from 'vitest';
import { isGoogleSignInUrl, rememberNonGoogleSignInUrl } from './browserGoogleSignIn';

test('detects Google account login hosts and ignores normal Google pages', () => {
  expect(isGoogleSignInUrl('https://accounts.google.com/v3/signin')).toBe(true);
  expect(isGoogleSignInUrl('https://accounts.youtube.com/accounts/SetSID')).toBe(true);
  expect(isGoogleSignInUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=x')).toBe(true);
  expect(isGoogleSignInUrl('https://www.google.com/search?q=test')).toBe(false);
  expect(isGoogleSignInUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
  expect(isGoogleSignInUrl('about:blank')).toBe(false);
});

test('keeps the last non-login url when navigation enters Google sign-in', () => {
  expect(rememberNonGoogleSignInUrl(
    'https://www.youtube.com/watch?v=abc',
    'https://accounts.google.com/v3/signin',
  )).toBe('https://www.youtube.com/watch?v=abc');
  expect(rememberNonGoogleSignInUrl(
    'https://www.youtube.com/watch?v=abc',
    'https://www.youtube.com/watch?v=def',
  )).toBe('https://www.youtube.com/watch?v=def');
});
