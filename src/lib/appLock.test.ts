import { expect, test } from 'vitest';
import { hasFocusedMediaPlayback, nextIdleActivityAt, shouldIdleLock } from './appLock';

function withFakeDocument(fake: { hasFocus: () => boolean; querySelectorAll: (selector: string) => unknown[] }) {
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = fake;
  return () => {
    (globalThis as { document?: unknown }).document = previous;
  };
}

test('does not treat background media as activity when the document is unfocused', () => {
  const restore = withFakeDocument({
    hasFocus: () => false,
    querySelectorAll: () => [{ paused: false, ended: false }],
  });

  try {
    expect(hasFocusedMediaPlayback()).toBe(false);
  } finally {
    restore();
  }
});

test('treats focused playing media as activity', () => {
  const restore = withFakeDocument({
    hasFocus: () => true,
    querySelectorAll: () => [{ paused: false, ended: false }],
  });

  try {
    expect(hasFocusedMediaPlayback()).toBe(true);
  } finally {
    restore();
  }
});

test('does not keep the app awake just because the browser window is focused', () => {
  const next = nextIdleActivityAt(1_000, 70_000, {
    hasFocusedMediaPlayback: false,
    browser: { focused: true, lastActivityAt: 1_000, hasPlayingMedia: false },
  });

  expect(next.keepAwake).toBe(false);
  expect(next.activityAt).toBe(1_000);
  expect(shouldIdleLock(next.activityAt, 70_000, 1)).toBe(true);
});

test('keeps the app awake while focused browser media is playing', () => {
  const next = nextIdleActivityAt(1_000, 10_000, {
    hasFocusedMediaPlayback: false,
    browser: { focused: true, lastActivityAt: 1_000, hasPlayingMedia: true },
  });

  expect(next.keepAwake).toBe(true);
  expect(next.activityAt).toBe(10_000);
  expect(shouldIdleLock(next.activityAt, 10_000, 1)).toBe(false);
});

test('counts recent browser input as activity even when the browser is unfocused', () => {
  const next = nextIdleActivityAt(1_000, 70_000, {
    hasFocusedMediaPlayback: false,
    browser: { focused: false, lastActivityAt: 65_000, hasPlayingMedia: false },
  });

  expect(next.keepAwake).toBe(false);
  expect(next.activityAt).toBe(65_000);
  expect(shouldIdleLock(next.activityAt, 70_000, 1)).toBe(false);
});
