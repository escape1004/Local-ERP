import React from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { RelatedRecordSummary } from '../../types';
import { Input } from '../ui/input';

const MAX_RELATED_RECORDS = 100;
const MAX_LABEL_LENGTH = 40;

function mergeKnown(
  current: RelatedRecordSummary[],
  incoming: RelatedRecordSummary[],
): RelatedRecordSummary[] {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function normalizeIds(value: string[] = []): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  value.forEach((entry) => {
    const id = String(entry || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    next.push(id);
  });
  return next;
}

export const RelatedRecordsEditor: React.FC<{
  sourceRecordId?: string;
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  onLabelChange: (label: string) => void;
}> = ({ sourceRecordId, value, onChange, label, onLabelChange }) => {
  const ids = React.useMemo(() => normalizeIds(value), [value]);
  const [expanded, setExpanded] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<RelatedRecordSummary[]>([]);
  const [known, setKnown] = React.useState<RelatedRecordSummary[]>([]);

  React.useEffect(() => {
    if (!sourceRecordId) return undefined;

    let cancelled = false;
    window.electronAPI.listRelatedRecords(sourceRecordId)
      .then((state) => {
        if (!cancelled) {
          setKnown((current) => mergeKnown(current, state.records));
        }
      })
      .catch((error) => {
        console.error('Failed to load related records:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceRecordId]);

  React.useEffect(() => {
    if (!expanded) return undefined;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      window.electronAPI.searchRelatedRecords({
        query,
        excludeId: sourceRecordId,
      }).then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setKnown((current) => mergeKnown(current, rows));
      }).catch((error) => {
        console.error('Failed to search related records:', error);
        if (!cancelled) setResults([]);
      });
    }, query.trim() ? 200 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [expanded, query, sourceRecordId]);

  const selected = ids.map((id) => {
    const candidate = known.find((item) => item.id === id);
    if (candidate) return candidate;
    return {
      id,
      categoryId: '',
      categoryName: '',
      label: id,
      record: { id, categoryId: '', data: {} },
    } as RelatedRecordSummary;
  });
  const selectedIds = new Set(ids);
  const matching = results.filter((candidate) => candidate.id !== sourceRecordId);
  const atLimit = ids.length >= MAX_RELATED_RECORDS;

  const setIds = (next: string[]) => {
    onChange(normalizeIds(next));
  };

  const toggle = (id: string) => {
    if (selectedIds.has(id)) {
      setIds(ids.filter((item) => item !== id));
      return;
    }
    if (atLimit) return;
    setIds([...ids, id]);
  };

  return (
    <section className="rounded-lg border border-gray-700 bg-discord-sidebar">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-discord-hover"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={16} className="shrink-0 text-discord-muted" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-discord-muted" />
        )}
        <span className="text-sm font-medium text-discord-text">관련 레코드</span>
        {ids.length > 0 && (
          <span className="text-xs text-discord-muted">{ids.length}</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-gray-700 px-4 pb-4 pt-3">
          <p className="text-xs text-discord-muted">
            관계 필드와 별개로, 카테고리에 상관없이 레코드를 연결합니다. 아래에서 지정한 표시 라벨은 다른 레코드의 관련 목록에 이 레코드가 나타날 때 사용됩니다.
          </p>

          <div>
            <label className="mb-1.5 block text-xs text-discord-muted" htmlFor="related-record-label">
              이 레코드의 표시 라벨
            </label>
            <Input
              id="related-record-label"
              value={label}
              onChange={(event) => onLabelChange(event.target.value.slice(0, MAX_LABEL_LENGTH))}
              placeholder="예: 주연, 원작 (선택)"
              maxLength={MAX_LABEL_LENGTH}
              className="h-9 bg-discord-bg border-gray-600 text-sm text-discord-text"
            />
          </div>

          {selected.length > 0 ? (
            <div className="overflow-hidden rounded border border-gray-700 bg-discord-bg">
              {selected.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex items-start gap-3 border-b border-gray-700 px-3 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-discord-muted">
                      {candidate.categoryName || '레코드'}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2">
                      {candidate.relationLabel ? (
                        <span className="inline-flex h-5 shrink-0 items-center rounded bg-yellow-500/20 px-1.5 text-[11px] font-medium leading-none text-yellow-300">
                          {candidate.relationLabel}
                        </span>
                      ) : null}
                      <span className="truncate text-sm font-semibold leading-5 text-discord-text">
                        {candidate.label}
                      </span>
                    </div>
                    {candidate.subtitle ? (
                      <div className="mt-0.5 truncate text-sm text-discord-text">
                        {candidate.subtitle}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(candidate.id)}
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-discord-muted hover:bg-discord-hover hover:text-discord-text"
                    title="연결 해제"
                    aria-label={`${candidate.label} 연결 해제`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-discord-muted">선택된 레코드가 없습니다.</p>
          )}

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-muted" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목 또는 카테고리 검색"
              aria-label="관련 레코드 검색"
              className="h-9 bg-discord-bg border-gray-600 pl-8 text-sm text-discord-text"
            />
          </div>

          <div className="max-h-52 overflow-y-auto rounded border border-gray-700 bg-discord-bg discord-scrollbar">
            {matching.length > 0 ? matching.map((candidate) => {
              const checked = selectedIds.has(candidate.id);
              return (
                <label
                  key={candidate.id}
                  className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-gray-700 px-3 py-2.5 text-sm last:border-0 hover:bg-discord-hover"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={() => toggle(candidate.id)}
                    className="accent-discord-accent"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-normal text-discord-muted">{candidate.categoryName}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-2">
                      {candidate.relationLabel ? (
                        <span className="inline-flex h-5 shrink-0 items-center rounded bg-yellow-500/20 px-1.5 text-[11px] font-medium leading-none text-yellow-300">
                          {candidate.relationLabel}
                        </span>
                      ) : null}
                      <strong className="truncate text-sm font-semibold leading-5 text-discord-text">{candidate.label}</strong>
                    </span>
                    {candidate.subtitle ? (
                      <span className="mt-0.5 block truncate text-sm text-discord-text">{candidate.subtitle}</span>
                    ) : null}
                  </span>
                </label>
              );
            }) : (
              <p className="px-3 py-4 text-xs text-discord-muted">
                {query.trim() ? '검색 결과가 없습니다.' : '검색 가능한 레코드가 없습니다.'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
