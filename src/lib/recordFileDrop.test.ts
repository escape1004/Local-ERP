import { expect, test } from 'vitest';
import {
  findDroppedRecordId,
  isLikelyDirectoryFile,
  isOsFileDrag,
  pickDroppedRecordFile,
  toStoredRecordFilePath,
} from './recordFileDrop';

test('detects operating-system file drags', () => {
  expect(isOsFileDrag({ types: ['Files'] } as DataTransfer)).toBe(true);
  expect(isOsFileDrag({ types: ['text/plain'] } as DataTransfer)).toBe(false);
  expect(isOsFileDrag(null)).toBe(false);
});

test('skips folders and empty names when picking a dropped file', () => {
  expect(pickDroppedRecordFile([
    { name: 'Clips', type: '', size: 0 },
    { name: 'Heat.mp4', type: 'video/mp4', size: 12 },
  ])).toEqual({ name: 'Heat.mp4', type: 'video/mp4', size: 12 });
  expect(pickDroppedRecordFile([{ name: 'Notes', type: '', size: 0 }])).toBeNull();
  expect(pickDroppedRecordFile([{ name: 'empty.txt', type: '', size: 0 }])).toEqual({
    name: 'empty.txt',
    type: '',
    size: 0,
  });
});

test('keeps zero-byte files with an extension and rejects unnamed items', () => {
  expect(isLikelyDirectoryFile({ name: 'folder', type: '', size: 0 })).toBe(true);
  expect(isLikelyDirectoryFile({ name: 'clip.mp4', type: '', size: 0 })).toBe(false);
  expect(isLikelyDirectoryFile({ name: '', type: '', size: 0 })).toBe(true);
});

test('stores app-root files as relative paths', () => {
  expect(toStoredRecordFilePath('E:\\app\\media\\Heat.mp4', 'E:\\app')).toBe('media\\Heat.mp4');
  expect(toStoredRecordFilePath('D:\\other\\Heat.mp4', 'E:\\app')).toBe('D:\\other\\Heat.mp4');
  expect(toStoredRecordFilePath('', 'E:\\app')).toBe('');
});

test('reads a record id from a dropped row', () => {
  const cell = {
    closest: (selector: string) => (
      selector === '[data-record-id]'
        ? { getAttribute: () => 'rec-1' }
        : null
    ),
  } as unknown as Element;

  expect(findDroppedRecordId(cell)).toBe('rec-1');
  expect(findDroppedRecordId({} as EventTarget)).toBeNull();
  expect(findDroppedRecordId(null)).toBeNull();
});
