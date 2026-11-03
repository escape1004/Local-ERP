import type { BrowserPasswordSummary } from '../types';

export type BrowserPasswordSavePrompt = {
  kind: 'save';
  pendingId: string;
  origin: string;
  username: string;
  updated: boolean;
};

export type BrowserPasswordFillPrompt = {
  kind: 'fill';
  accounts: BrowserPasswordSummary[];
};

export type BrowserPasswordPrompt = BrowserPasswordSavePrompt | BrowserPasswordFillPrompt;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parsePasswordSavePrompt(value: unknown): BrowserPasswordSavePrompt | null {
  const payload = asRecord(value);
  const pendingId = String(payload?.pendingId || '').trim();
  const username = String(payload?.username || '').trim();
  const origin = String(payload?.origin || '').trim();
  if (!pendingId || !username) return null;
  return {
    kind: 'save',
    pendingId,
    origin,
    username,
    updated: Boolean(payload?.updated),
  };
}

export function parsePasswordFillPrompt(value: unknown): BrowserPasswordFillPrompt | null {
  const payload = asRecord(value);
  const accounts = Array.isArray(payload?.accounts)
    ? payload.accounts.flatMap((item) => {
      const entry = asRecord(item);
      const id = String(entry?.id || '').trim();
      const username = String(entry?.username || '').trim();
      if (!id || !username) return [];
      return [{
        id,
        origin: String(entry?.origin || ''),
        username,
        updatedAt: String(entry?.updatedAt || ''),
      }];
    })
    : [];
  if (accounts.length === 0) return null;
  return { kind: 'fill', accounts };
}
