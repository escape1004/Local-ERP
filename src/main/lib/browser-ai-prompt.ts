export const BROWSER_AI_PAGE_HTML_LIMIT = 12000;
export const BROWSER_AI_SELECTED_HTML_LIMIT = 4000;
export const BROWSER_AI_RECORD_LIMIT = 8;
export const BROWSER_AI_CHAT_HISTORY_LIMIT = 12;

function simplifyHtml(html, maxLength) {
  const parsed = Number(maxLength);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : BROWSER_AI_PAGE_HTML_LIMIT;
  const text = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n<!-- truncated -->`;
}

export function formatBrowserRecordsForPrompt(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return 'No Local ERP records match this URL.';
  }

  const sliced = records.slice(0, BROWSER_AI_RECORD_LIMIT).map((item) => ({
    id: String(item?.id || ''),
    categoryId: String(item?.categoryId || ''),
    label: String(item?.label || '').slice(0, 200),
    urls: Array.isArray(item?.urls) ? item.urls.slice(0, 6).map((url) => String(url || '')).filter(Boolean) : [],
  }));
  return `Matching Local ERP records for this URL:\n${JSON.stringify(sliced, null, 2)}`;
}

export function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function extractBrowserScriptFromReply(text) {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed.source !== 'string' || !parsed.source.trim()) return null;
  const matches = Array.isArray(parsed.matches)
    ? parsed.matches.filter((item) => typeof item === 'string' && item.trim())
    : [];
  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : '새 스크립트',
    matches: matches.length > 0 ? matches : ['*'],
    source: parsed.source.trim(),
  };
}

export function visibleBrowserAiReply(text, script) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (!script) return trimmed;

  let visible = trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*[\s\S]*?```/i);
  if (fenced) {
    visible = trimmed.replace(fenced[0], '').trim();
  } else {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      visible = `${trimmed.slice(0, start)}\n${trimmed.slice(end + 1)}`.trim();
    }
  }
  return visible || '스크립트 초안을 만들었습니다. 확인 후 적용하세요.';
}

export function normalizeBrowserAiChatMessages(messages) {
  const normalized = (Array.isArray(messages) ? messages : [])
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim(),
    }))
    .filter((item) => item.content);
  if (normalized.length <= BROWSER_AI_CHAT_HISTORY_LIMIT) return normalized;
  return normalized.slice(-BROWSER_AI_CHAT_HISTORY_LIMIT);
}

export function buildBrowserScriptSystemPrompt() {
  return [
    'You are a userscript assistant for a special-purpose Electron browser inside Local ERP.',
    'Reply in Korean. Ask a short clarifying question when the request is ambiguous.',
    'When you have a working script, include a JSON object with keys: name (string), matches (Tampermonkey-style URL pattern array), source (javascript string).',
    'You may wrap that JSON in a ```json fence. Also explain the script briefly in Korean.',
    'The script runs in an isolated world that can read/write the page DOM.',
    'Available API:',
    '- await window.erp.findRecordsByUrl(url?) -> [{ id, categoryId, label, urls }]',
    '- window.erp.getCurrentUrl() -> string',
    '- window.erp.onUrlChange(callback) -> unsubscribe function',
    'Scripts must be idempotent. Use data attributes or a global flag so re-injection is safe.',
    'Do not fetch remote code. Do not try to modify Local ERP records.',
    'Use the current tab snapshot and matching records when they help fulfill the request.',
    'Prefer selectors that exist in the page HTML. Call window.erp.findRecordsByUrl at runtime if the script needs live record data.',
  ].join('\n');
}

export function buildBrowserScriptTabContext(input) {
  const pageUrl = String(input?.url || '').trim() || 'about:blank';
  const pageTitle = String(input?.title || '').trim();
  const snapshot = simplifyHtml(input?.pageHtml, BROWSER_AI_PAGE_HTML_LIMIT);
  const selection = simplifyHtml(input?.selectedHtml, BROWSER_AI_SELECTED_HTML_LIMIT);

  return [
    'Current tab context. Use this when writing or revising a script. Do not repeat this snapshot in later replies.',
    `Current page URL: ${pageUrl}`,
    `Current page title: ${pageTitle || '(none)'}`,
    formatBrowserRecordsForPrompt(input?.records),
    snapshot ? `Current tab HTML snapshot:\n${snapshot}` : 'No page HTML was captured from the current tab.',
    selection ? `Optional selected HTML snippet:\n${selection}` : 'No extra HTML snippet was provided.',
  ].join('\n');
}

export function buildBrowserAiChatInput(input) {
  const messages = [
    { role: 'developer', content: buildBrowserScriptSystemPrompt() },
  ];
  if (input?.includePageContext) {
    messages.push({ role: 'developer', content: buildBrowserScriptTabContext(input) });
  }
  normalizeBrowserAiChatMessages(input?.messages).forEach((item) => {
    messages.push({ role: item.role, content: item.content });
  });
  return messages;
}

export function buildBrowserScriptPrompt(input) {
  return [
    buildBrowserScriptSystemPrompt(),
    buildBrowserScriptTabContext(input),
    `User request: ${String(input?.intent || '').trim()}`,
  ].join('\n');
}
