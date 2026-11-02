import { extractResponseText } from '../lib/openai-response';
import { normalizeTranslationModel } from '../lib/config-normalize';
import {
  buildBrowserAiChatInput,
  extractBrowserScriptFromReply,
  visibleBrowserAiReply,
} from '../lib/browser-ai-prompt';
import { getOpenAiApiKey } from './openai-secret';

function sanitizeError(error, apiKey) {
  const fallback = '스크립트 생성에 실패했습니다.';
  const message = String(error?.message || fallback);
  if (apiKey && message.includes(apiKey)) return fallback;
  return message;
}

export async function generateBrowserScriptWithOpenAi({
  url,
  title,
  intent,
  selectedHtml,
  pageHtml,
  records,
  messages,
  includePageContext,
  model,
}) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  }

  const chatMessages = Array.isArray(messages) && messages.length > 0
    ? messages
    : (String(intent || '').trim() ? [{ role: 'user', content: String(intent).trim() }] : []);
  if (chatMessages.length === 0) {
    throw new Error('원하는 동작을 입력해주세요.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const input = buildBrowserAiChatInput({
    url,
    title,
    pageHtml,
    selectedHtml,
    records,
    messages: chatMessages,
    includePageContext: includePageContext !== false,
  });

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
        input,
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

    const reply = extractResponseText(responseBody);
    if (!reply) {
      throw new Error('응답을 읽지 못했습니다.');
    }

    const script = extractBrowserScriptFromReply(reply);
    return {
      reply,
      display: visibleBrowserAiReply(reply, script),
      ...(script || {}),
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
