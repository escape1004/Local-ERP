import { expect, test } from 'vitest';
import {
  BROWSER_AI_CHAT_HISTORY_LIMIT,
  buildBrowserAiChatInput,
  buildBrowserScriptPrompt,
  extractBrowserScriptFromReply,
  formatBrowserRecordsForPrompt,
  normalizeBrowserAiChatMessages,
  visibleBrowserAiReply,
} from './browser-ai-prompt';

test('says when no records match the current tab', () => {
  expect(formatBrowserRecordsForPrompt([])).toBe('No Local ERP records match this URL.');
  expect(formatBrowserRecordsForPrompt(undefined)).toBe('No Local ERP records match this URL.');
});

test('includes matching record labels and urls', () => {
  const text = formatBrowserRecordsForPrompt([
    { id: 'rec-1', categoryId: 'cat-1', label: 'Example video', urls: ['https://example.com/watch'] },
  ]);
  expect(text).toContain('Matching Local ERP records for this URL:');
  expect(text).toContain('Example video');
  expect(text).toContain('https://example.com/watch');
});

test('builds a prompt from the active tab snapshot and records', () => {
  const prompt = buildBrowserScriptPrompt({
    url: 'https://example.com/watch?v=abc',
    title: 'Example video',
    intent: '레코드 제목에 파란 테두리를 그려줘',
    pageHtml: '<html><body><h1>Example video</h1><script>alert(1)</script></body></html>',
    selectedHtml: '',
    records: [{ id: 'rec-1', categoryId: 'cat-1', label: 'Example video', urls: ['https://example.com/watch?v=abc'] }],
  });
  expect(prompt).toContain('Current page URL: https://example.com/watch?v=abc');
  expect(prompt).toContain('Current page title: Example video');
  expect(prompt).toContain('레코드 제목에 파란 테두리를 그려줘');
  expect(prompt).toContain('Example video');
  expect(prompt).toContain('<h1>Example video</h1>');
  expect(prompt).not.toContain('alert(1)');
  expect(prompt).toContain('await window.erp.findRecordsByUrl');
});

test('notes when the current tab html was not captured', () => {
  const prompt = buildBrowserScriptPrompt({
    url: 'about:blank',
    intent: '새 탭에서 안내를 보여줘',
    records: [],
  });
  expect(prompt).toContain('No page HTML was captured from the current tab.');
  expect(prompt).toContain('No Local ERP records match this URL.');
});

test('extracts a script from a conversational json reply', () => {
  const reply = [
    '파란 테두리를 그리는 스크립트입니다.',
    '```json',
    JSON.stringify({
      name: '파란 테두리',
      matches: ['https://example.com/*'],
      source: 'document.body.style.outline = "3px solid blue";',
    }),
    '```',
  ].join('\n');
  expect(extractBrowserScriptFromReply(reply)).toEqual({
    name: '파란 테두리',
    matches: ['https://example.com/*'],
    source: 'document.body.style.outline = "3px solid blue";',
  });
  expect(visibleBrowserAiReply(reply, extractBrowserScriptFromReply(reply))).toBe('파란 테두리를 그리는 스크립트입니다.');
});

test('keeps recent chat turns and only attaches tab context when asked', () => {
  const history = Array.from({ length: BROWSER_AI_CHAT_HISTORY_LIMIT + 4 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${index}`,
  }));
  expect(normalizeBrowserAiChatMessages(history)).toHaveLength(BROWSER_AI_CHAT_HISTORY_LIMIT);
  expect(normalizeBrowserAiChatMessages(history)[0].content).toBe('turn-4');

  const withContext = buildBrowserAiChatInput({
    includePageContext: true,
    url: 'https://example.com/watch',
    title: 'Example',
    pageHtml: '<h1>Example</h1>',
    records: [],
    messages: [{ role: 'user', content: '테두리를 그려줘' }],
  });
  expect(withContext[0].role).toBe('developer');
  expect(withContext.some((item) => String(item.content).includes('Current tab HTML snapshot'))).toBe(true);
  expect(withContext.at(-1)).toEqual({ role: 'user', content: '테두리를 그려줘' });

  const followUp = buildBrowserAiChatInput({
    includePageContext: false,
    messages: [
      { role: 'user', content: '테두리를 그려줘' },
      { role: 'assistant', content: '어떤 색으로 할까요?' },
      { role: 'user', content: '파란색으로' },
    ],
  });
  expect(followUp.some((item) => String(item.content).includes('Current tab HTML snapshot'))).toBe(false);
  expect(followUp.filter((item) => item.role === 'user' || item.role === 'assistant')).toHaveLength(3);
});
