import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parsePasswordFillPrompt, parsePasswordSavePrompt } from './browserPasswordPrompt';

test('parsePasswordSavePrompt keeps username and hides nothing extra', () => {
  assert.equal(parsePasswordSavePrompt({ pendingId: 'p1', username: 'user', origin: 'https://example.com' })?.kind, 'save');
  assert.equal(parsePasswordSavePrompt({ pendingId: '', username: 'user' }), null);
  assert.equal(parsePasswordSavePrompt({ password: 'secret', username: 'user' }), null);
});

test('parsePasswordFillPrompt only keeps id and username summaries', () => {
  const parsed = parsePasswordFillPrompt({
    accounts: [
      { id: 'pw-1', username: 'user', origin: 'https://example.com', password: 'secret' },
      { username: 'missing-id' },
    ],
  });
  assert.deepEqual(parsed, {
    kind: 'fill',
    accounts: [{
      id: 'pw-1',
      origin: 'https://example.com',
      username: 'user',
      updatedAt: '',
    }],
  });
  assert.equal(parsePasswordFillPrompt({ accounts: [] }), null);
});
