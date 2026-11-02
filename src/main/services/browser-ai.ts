import { extractResponseText } from '../lib/openai-response';
import { normalizeTranslationModel } from '../lib/config-normalize';
import { getOpenAiApiKey } from './openai-secret';

function sanitizeError(error, apiKey) {
  const fallback = '스크립트 생성에 실패했습니다.';
  const message = String(error?.message || fallback);
  if (apiKey && message.includes(apiKey)) return fallback;
  return message;
}

function extractJsonObject(text) {
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

export async function generateBrowserScriptWithOpenAi({
  url,
  intent,
  selectedHtml,
  model,
}) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  }

  const pageUrl = String(url || '').trim() || 'about:blank';
  const userIntent = String(intent || '').trim();
  if (!userIntent) {
    throw new Error('원하는 동작을 입력해주세요.');
  }

  const htmlSnippet = String(selectedHtml || '').trim().slice(0, 4000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const prompt = [
    'You write userscripts for a special-purpose Electron browser inside Local ERP.',
    'Return JSON only with keys: name (string), matches (string array of Tampermonkey-style URL patterns), source (javascript string).',
    'Do not wrap the JSON in markdown.',
    'The script runs in an isolated world that can read/write the page DOM.',
    'Available API:',
    '- await window.erp.findRecordsByUrl(url?) -> [{ id, categoryId, label, urls }]',
    '- window.erp.getCurrentUrl() -> string',
    '- window.erp.onUrlChange(callback) -> unsubscribe function',
    'Scripts must be idempotent. Use data attributes or a global flag so re-injection is safe.',
    'Do not fetch remote code. Do not try to modify Local ERP records.',
    `Current page URL: ${pageUrl}`,
    `User request: ${userIntent}`,
    htmlSnippet ? `Optional selected HTML snippet:\n${htmlSnippet}` : 'No HTML snippet was provided.',
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: normalizeTranslationModel(model),
        store: false,
        input: prompt,
      }),
      signal: controller.signal,
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(sanitizeError({
        message: responseBody?.error?.message || `OpenAI API 요청에 실패했습니다. (${response.status})`,
      }, apiKey));
      error.status = response.status;
      error.code = responseBody?.error?.code;
      error.type = responseBody?.error?.type;
      throw error;
    }

    const parsed = extractJsonObject(extractResponseText(responseBody));
    if (!parsed || typeof parsed.source !== 'string' || !parsed.source.trim()) {
      throw new Error('생성된 스크립트를 읽지 못했습니다.');
    }

    const matches = Array.isArray(parsed.matches)
      ? parsed.matches.filter((item) => typeof item === 'string' && item.trim())
      : [];

    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : '새 스크립트',
      matches: matches.length > 0 ? matches : ['*'],
      source: parsed.source.trim(),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('스크립트 생성 요청 시간이 초과되었습니다.');
    }
    const wrapped: any = new Error(sanitizeError(error, apiKey));
    wrapped.status = error?.status;
    wrapped.code = error?.code;
    wrapped.type = error?.type;
    throw wrapped;
  } finally {
    clearTimeout(timeoutId);
  }
}
