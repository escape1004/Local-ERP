export const MANUAL_BOOKMARK_DRAG_PREFIX = 'erp-manual:';
export const MANUAL_DRAG_THRESHOLD_PX = 10;

export type ManualDragItem = { kind: 'bookmark' | 'folder'; id: string };

export function encodeManualDragItem(item: ManualDragItem) {
  return `${MANUAL_BOOKMARK_DRAG_PREFIX}${JSON.stringify(item)}`;
}

export function parseManualDragItem(raw: string): ManualDragItem | null {
  if (typeof raw !== 'string' || !raw.startsWith(MANUAL_BOOKMARK_DRAG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(MANUAL_BOOKMARK_DRAG_PREFIX.length));
    if (parsed?.kind !== 'bookmark' && parsed?.kind !== 'folder') return null;
    const id = String(parsed.id || '').trim();
    if (!id) return null;
    return { kind: parsed.kind, id };
  } catch {
    return null;
  }
}
