import { expect, test } from 'vitest';
import { getProfileSelectCardWidthPx, getProfileSelectTileCount } from './profileSelectLayout';

test('sizes the card for one profile plus the add tile, then grows with each extra profile', () => {
  expect(getProfileSelectTileCount(0)).toBe(2);
  expect(getProfileSelectTileCount(1)).toBe(2);
  expect(getProfileSelectTileCount(3)).toBe(4);

  expect(getProfileSelectCardWidthPx(1)).toBe(362);
  expect(getProfileSelectCardWidthPx(2)).toBe(526);
  expect(getProfileSelectCardWidthPx(3)).toBe(690);
});
