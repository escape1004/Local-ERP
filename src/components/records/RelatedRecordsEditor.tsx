import React from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { RelatedRecordSummary } from '../../types';
import { Input } from '../ui/input';

const MAX_RELATED_RECORDS = 100;

function mergeKnown(
  current: RelatedRecordSummary[],
  incoming: RelatedRecordSummary[],
): RelatedRecordSummary[] {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

export const RelatedRecordsEditor: React.FC<{
  sourceRecordId?: string;
  value: string[];
  onChange: (value: string[]) => void;
}> = ({ sourceRecordId, value, onChange }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<RelatedRecordSummary[]>([]);
  const [known, setKnown] = React.useState<RelatedRecordSummary[]>([]);

  React.useEffect(() => {
    if (!sourceRecordId) return undefined;

    let cancelled = false;
    window.electronAPI.listRelatedRecords(sourceRecordId)
      .then((rows) => {
        if (!cancelled) {
          setKnown((current) => mergeKnown(current, rows));
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

  const selected = value.flatMap((id) => {
    const candidate = known.find((item) => item.id === id);
    return candidate ? [candidate] : [];
  });
  const matching = results.filter((candidate) => candidate.id !== sourceRecordId);
  const atLimit = value.length >= MAX_RELATED_RECORDS;

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
      return;
    }
    if (atLimit) return;
    onChange([...value, id]);
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
        <span className="text-sm font-medium text-discord-text">관련 항목</span>
        {value.length > 0 && (
          <span className="text-xs text-discord-muted">{value.length}</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-gray-700 px-4 pb-4 pt-3">
          <p className="text-xs text-discord-muted">
            관계 필드와 별개로, 카테고리에 상관없이 항목을 연결합니다. 양쪽 항목에서 같은 연결을 관리하며, 어느 쪽에서든 끊을 수 있습니다.
          </p>

          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => toggle(candidate.id)}
                  className="max-w-full whitespace-normal rounded-full border border-discord-accent/30 bg-discord-accent/10 px-3 py-1.5 text-left text-xs text-discord-text"
                  title="연결 해제"
                >
                  <span className="text-[11px] font-normal">{candidate.categoryName}</span>
                  <span className="mx-1">·</span>
                  <span className="font-semibold">{candidate.label}</span>
                  {' '}×
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-discord-muted">선택된 항목이 없습니다.</p>
          )}

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-muted" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목 또는 카테고리 검색"
              aria-label="관련 항목 검색"
              className="h-9 bg-discord-bg border-gray-600 pl-8 text-sm text-discord-text"
            />
          </div>

          <div className="max-h-52 overflow-y-auto rounded border border-gray-700 bg-discord-bg discord-scrollbar">
            {matching.length > 0 ? matching.map((candidate) => {
              const checked = value.includes(candidate.id);
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
                    <span className="block truncate text-xs font-normal text-discord-text">{candidate.categoryName}</span>
                    <strong className="mt-0.5 block truncate text-sm font-semibold text-discord-text">{candidate.label}</strong>
                  </span>
                </label>
              );
            }) : (
              <p className="px-3 py-4 text-xs text-discord-muted">
                {query.trim() ? '검색 결과가 없습니다.' : '검색 가능한 항목이 없습니다.'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
