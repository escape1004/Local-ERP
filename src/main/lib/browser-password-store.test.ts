import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  addNeverSaveOrigin,
  createPasswordEntry,
  originFromBrowserUrl,
  summarizePasswordEntries,
  upsertPasswordEntry,
} from './browser-password-store.ts';

test('originFromBrowserUrl keeps scheme host and port', () => {
  assert.equal(originFromBrowserUrl('https://Accounts.Google.com/signin?x=1'), 'https://accounts.google.com');
  assert.equal(originFromBrowserUrl('https://example.com:8443/app'), 'https://example.com:8443');
  assert.equal(originFromBrowserUrl('about:blank'), '');
});

test('upserts a login and hides the password in summaries', () => {
  const created = upsertPasswordEntry({ entries: [], neverSaveOrigins: [] }, {
    id: 'pw-1',
    origin: 'https://example.com/login',
    username: 'user@example.com',
    password: 'secret-1',
  });
  assert.equal(created.created, true);
  assert.equal(created.entry.password, 'secret-1');
  assert.deepEqual(summarizePasswordEntries(created.vault.entries), [{
    id: 'pw-1',
    origin: 'https://example.com',
    username: 'user@example.com',
    updatedAt: created.entry.updatedAt,
  }]);

  const unchanged = upsertPasswordEntry(created.vault, {
    origin: 'https://example.com',
    username: 'user@example.com',
    password: 'secret-1',
  });
  assert.equal(unchanged.skipped, 'unchanged');

  const updated = upsertPasswordEntry(created.vault, {
    origin: 'https://example.com',
    username: 'user@example.com',
    password: 'secret-2',
  });
  assert.equal(updated.updated, true);
  assert.equal(updated.entry.password, 'secret-2');
});

test('rejects empty or oversized login fields', () => {
  assert.equal(createPasswordEntry({ origin: 'https://example.com', username: 'user', password: '' }), null);
  assert.equal(createPasswordEntry({ origin: 'ftp://example.com', username: 'user', password: 'secret' }), null);
  assert.equal(createPasswordEntry({
    origin: 'https://example.com',
    username: 'user',
    password: 'x'.repeat(501),
  }), null);
  assert.equal(upsertPasswordEntry({ entries: [], neverSaveOrigins: [] }, {
    origin: 'https://example.com',
    username: '',
    password: 'secret',
  }).skipped, 'invalid');
});

test('never-save origins skip later upserts and drop existing logins', () => {
  const seeded = upsertPasswordEntry({ entries: [], neverSaveOrigins: [] }, {
    id: 'pw-1',
    origin: 'https://example.com',
    username: 'user',
    password: 'secret',
  });
  const blocked = addNeverSaveOrigin(seeded.vault, 'https://example.com/account');
  assert.equal(blocked.vault.entries.length, 0);
  assert.deepEqual(blocked.vault.neverSaveOrigins, ['https://example.com']);
  const skipped = upsertPasswordEntry(blocked.vault, createPasswordEntry({
    origin: 'https://example.com',
    username: 'user',
    password: 'secret',
  }));
  assert.equal(skipped.skipped, 'never');
});
