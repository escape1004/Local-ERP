export const PROFILE_TILE_WIDTH_PX = 132;
export const PROFILE_TILE_GAP_PX = 32;
export const PROFILE_CARD_PADDING_X_PX = 64;
export const PROFILE_CARD_BORDER_X_PX = 2;

export function getProfileSelectTileCount(profileCount: number) {
  return Math.max(profileCount, 2) + 1;
}

export function getProfileSelectCardWidthPx(profileCount: number) {
  const tileCount = getProfileSelectTileCount(profileCount);
  const gapCount = Math.max(tileCount - 1, 0);
  return tileCount * PROFILE_TILE_WIDTH_PX
    + gapCount * PROFILE_TILE_GAP_PX
    + PROFILE_CARD_PADDING_X_PX
    + PROFILE_CARD_BORDER_X_PX;
}
