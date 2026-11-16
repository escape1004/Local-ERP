import { expect, test } from 'vitest';
import { buildDeletedRecordRestorePayload, createDeletedRecordSnapshot } from './recordDeleteUndo';

const record = {
  id: 'rec-1',
  categoryId: 'cat-1',
  data: { title: 'Heat' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

test('snapshots a deleted record without keeping a live reference to its data', () => {
  const source = { ...record, data: { title: 'Heat' } };
  const snapshot = createDeletedRecordSnapshot(source, ['rel-1'], '원작');
  source.data.title = 'changed';
  source.id = 'mutated';

  expect(snapshot.record.id).toBe('rec-1');
  expect(snapshot.record.data).toEqual({ title: 'Heat' });
  expect(snapshot.relatedRecordIds).toEqual(['rel-1']);
  expect(snapshot.relatedLabel).toBe('원작');
});

test('restores a deleted record with the same id, related records, and label', () => {
  const snapshot = createDeletedRecordSnapshot(record, ['rel-1', 'rel-2'], '원작');
  expect(buildDeletedRecordRestorePayload(snapshot)).toEqual({
    id: 'rec-1',
    categoryId: 'cat-1',
    data: { title: 'Heat' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    relatedRecordIds: ['rel-1', 'rel-2'],
    relatedLabel: '원작',
  });
});
