import { expect, test } from 'vitest';
import { encodeManualDragItem, parseManualDragItem } from './bookmark-dnd';

test('round-trips a bookmark drag payload', () => {
  const encoded = encodeManualDragItem({ kind: 'bookmark', id: 'abc' });
  expect(parseManualDragItem(encoded)).toEqual({ kind: 'bookmark', id: 'abc' });
});

test('rejects unrelated drag data', () => {
  expect(parseManualDragItem('https://example.com')).toBeNull();
  expect(parseManualDragItem('erp-manual:{"kind":"bookmark"}')).toBeNull();
});
