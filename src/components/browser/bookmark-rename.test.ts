import { expect, test } from 'vitest';
import { startRenameAfterMenuClose } from './bookmark-rename';

test('starts rename only after a pending context menu close', () => {
  const pending = { current: true };
  let started = 0;
  const event = { preventDefault() {} } as Event;

  startRenameAfterMenuClose(event, pending, () => {
    started += 1;
  });

  expect(started).toBe(1);
  expect(pending.current).toBe(false);

  startRenameAfterMenuClose(event, pending, () => {
    started += 1;
  });
  expect(started).toBe(1);
});
