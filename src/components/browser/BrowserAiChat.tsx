import React from 'react';
import { Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';

export type BrowserAiChatScript = {
  name: string;
  matches: string[];
  source: string;
};

export type BrowserAiChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  raw?: string;
  script?: BrowserAiChatScript | null;
};

type BrowserAiChatProps = {
  currentUrl: string;
  contextUrl: string;
  generating: boolean;
  messages: BrowserAiChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onNewChat: () => void;
  onApplyScript: (script: BrowserAiChatScript) => void;
  onTestScript: (script: BrowserAiChatScript) => void;
};

function tabHostLabel(url: string) {
  if (!url || url === 'about:blank') return '빈 탭';
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function ChatTooltip({
  label,
  wrapDisabled,
  wrapClassName = 'inline-flex',
  children,
}: {
  label: string;
  wrapDisabled?: boolean;
  wrapClassName?: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {wrapDisabled ? <span className={wrapClassName}>{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function BrowserAiChat({
  currentUrl,
  contextUrl,
  generating,
  messages,
  input,
  onInputChange,
  onSend,
  onNewChat,
  onApplyScript,
  onTestScript,
}: BrowserAiChatProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const canSend = Boolean(input.trim()) && !generating;

  React.useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, generating]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-gray-800 px-3 py-3">
        <p className="text-sm leading-relaxed text-discord-muted">
          현재 탭을 보며 대화합니다. 페이지 내용과 연결된 레코드는 첫 메시지, 또는 탭이 바뀐 뒤에만 다시 보냅니다.
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-discord-muted">
            {contextUrl ? `${tabHostLabel(contextUrl)} 참고 중` : `${tabHostLabel(currentUrl)}에 보낼 예정`}
          </span>
          <ChatTooltip label="새 대화 시작" wrapDisabled={messages.length === 0 && !input}>
            <Button
              variant="ghost"
              className="h-8 px-2 text-sm text-discord-muted"
              disabled={messages.length === 0 && !input && !generating}
              onClick={onNewChat}
            >
              새 대화
            </Button>
          </ChatTooltip>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto discord-scrollbar px-3 py-3">
        {messages.length === 0 && !generating && (
          <p className="text-sm leading-relaxed text-discord-muted">
            예: 이 페이지에서 레코드 제목과 맞는 영상에 파란색 테두리를 그려줘
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-md px-2.5 py-2 text-sm leading-relaxed ${
              message.role === 'user'
                ? 'ml-6 bg-discord-accent/20 text-discord-text'
                : 'mr-4 bg-discord-bg text-discord-text'
            }`}
          >
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
            {message.script?.source ? (
              <div className="mt-2 space-y-1.5">
                <Button
                  className="h-8 w-full bg-discord-accent hover:bg-blue-600 text-sm"
                  onClick={() => onApplyScript(message.script as BrowserAiChatScript)}
                >
                  스크립트에 적용
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-full border-gray-600 text-sm"
                  onClick={() => onTestScript(message.script as BrowserAiChatScript)}
                >
                  스크립트 테스트
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {generating && (
          <div className="mr-4 rounded-md bg-discord-bg px-2.5 py-2 text-sm text-discord-muted">
            생각 중...
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-gray-800 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
      >
        <Textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            if (canSend) onSend();
          }}
          disabled={generating}
          className="min-h-[72px] bg-discord-bg border-gray-600 text-sm text-discord-text"
          placeholder="원하는 동작을 입력하세요"
        />
        <ChatTooltip label="현재 탭을 참고해 보내기" wrapDisabled={!canSend} wrapClassName="flex w-full">
          <Button
            type="submit"
            className="mt-2 h-8 w-full bg-discord-accent hover:bg-blue-600 text-sm"
            disabled={!canSend}
          >
            <Send size={12} className="mr-1" />
            {generating ? '보내는 중...' : '보내기'}
          </Button>
        </ChatTooltip>
      </form>
    </div>
  );
}
