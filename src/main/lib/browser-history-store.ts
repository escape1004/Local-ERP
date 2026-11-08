import crypto from 'crypto';
import { canonicalizeBrowserUrl } from './browser-url';
import {
  MAX_BROWSER_HISTORY,
  shouldMergeBrowserHistoryVisit,
  shouldRecordBrowserHistoryUrl,
} from './browser-history';
import { db } from '../database/connection';
import { log } from '../app/state';

let lastVisit: { id: string; url: string; at: number } | null = null;

function nowIso() {
  return new Date().toISOString();
}

export function recordBrowserHistoryVisit(payload: { url?: string; title?: string } = {}) {
  const rawUrl = String(payload.url || '').trim();
  if (!shouldRecordBrowserHistoryUrl(rawUrl)) return null;
  const url = canonicalizeBrowserUrl(rawUrl) || rawUrl;
  const title = String(payload.title || '').trim() || url;
  const now = Date.now();
  try {
    if (lastVisit && shouldMergeBrowserHistoryVisit({ url: lastVisit.url, at: lastVisit.at }, url, now)) {
      db.prepare('UPDATE browser_history SET title = ?, visited_at = ? WHERE id = ?').run(title, nowIso(), lastVisit.id);
      lastVisit = { id: lastVisit.id, url, at: now };
      return lastVisit.id;
    }
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO browser_history (id, url, title, visited_at)
      VALUES (?, ?, ?, ?)
    `).run(id, url, title, nowIso());
    const extra = db.prepare(`
      SELECT id FROM browser_history
      ORDER BY visited_at DESC
      LIMIT -1 OFFSET ?
    `).all(MAX_BROWSER_HISTORY) as Array<{ id: string }>;
    if (extra.length > 0) {
      const ids = extra.map((row) => row.id);
      db.prepare(`DELETE FROM browser_history WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
    lastVisit = { id, url, at: now };
    return id;
  } catch (error) {
    log('브라우저 방문 기록 저장 실패:', error);
    return null;
  }
}

export function listBrowserHistory(limit = 200) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 200), MAX_BROWSER_HISTORY);
  try {
    return db.prepare(`
      SELECT id, url, title, visited_at AS visitedAt
      FROM browser_history
      ORDER BY visited_at DESC
      LIMIT ?
    `).all(safeLimit);
  } catch (error) {
    log('브라우저 방문 기록 조회 실패:', error);
    return [];
  }
}

export function deleteBrowserHistoryItem(id: string) {
  db.prepare('DELETE FROM browser_history WHERE id = ?').run(String(id || ''));
  return { success: true };
}

export function clearBrowserHistory() {
  db.prepare('DELETE FROM browser_history').run();
  lastVisit = null;
  return { success: true };
}
