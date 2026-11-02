import { expect, test } from 'vitest';
import { splitScriptSearchChunks } from './browserScriptSearch';

test('returns the whole script when there is no search query', () => {
  expect(splitScriptSearchChunks('const name = "blue";', '')).toEqual([
    { text: 'const name = "blue";', match: false },
  ]);
});

test('highlights case-insensitive matches inside a script', () => {
  expect(splitScriptSearchChunks('FindRecordsByUrl and findRecordsByUrl', 'findrecordsbyurl')).toEqual([
    { text: 'FindRecordsByUrl', match: true },
    { text: ' and ', match: false },
    { text: 'findRecordsByUrl', match: true },
  ]);
});

test('returns an empty list for an empty script', () => {
  expect(splitScriptSearchChunks('', 'url')).toEqual([]);
});
