import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Category, DataRecord, RelatedRecordSummary } from '../../types';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { resolveFilePath } from '../../lib/pathResolver';
import {
  getCategoryFileField,
  paginateItems,
} from '../../lib/referringRecords';
import { ThumbnailCell } from './ThumbnailCell';

export const RelatedRecordsPanel: React.FC<{
  records: RelatedRecordSummary[];
  categories: Category[];
  onSelectRecord?: (record: DataRecord, category: Category) => void;
}> = ({ records, categories, onSelectRecord }) => {
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);
  const categoryById = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const labeledRecords = React.useMemo(
    () => records.map((item) => {
      const relatedCategory = categoryById.get(item.categoryId);
      return {
        item,
        category: relatedCategory,
        fileField: relatedCategory ? getCategoryFileField(relatedCategory) : undefined,
      };
    }),
    [categoryById, records],
  );

  const filteredRecords = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return labeledRecords;
    return labeledRecords.filter(({ item }) => (
      item.label.toLowerCase().includes(normalizedQuery)
      || item.categoryName.toLowerCase().includes(normalizedQuery)
    ));
  }, [labeledRecords, query]);

  const paged = React.useMemo(
    () => paginateItems(filteredRecords, page),
    [filteredRecords, page],
  );

  React.useEffect(() => {
    setPage(1);
  }, [query, records]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-gray-700 bg-discord-bg">
      <div className="flex-shrink-0 border-b border-gray-700 p-4">
        <div className="text-sm font-semibold text-discord-text">관련 레코드</div>
        <div className="relative mt-3">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="레코드 검색"
            className="h-8 bg-discord-sidebar border-gray-600 pl-8 text-xs text-discord-text"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto discord-scrollbar p-2">
        {paged.total === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-discord-muted">
            {query.trim() ? '검색 결과가 없습니다.' : '관련 레코드가 없습니다.'}
          </div>
        ) : (
          <div className="space-y-1">
            {paged.items.map(({ item, category, fileField }) => {
              const content = (
                <>
                  {fileField && (
                    <div className="pointer-events-none shrink-0">
                      <ThumbnailCell
                        filePath={resolveFilePath(item.record.data[fileField.id], fileField) || undefined}
                        record={item.record}
                        thumbnailFit="cover"
                        thumbnailOnly
                        showStatusIcons={false}
                        videoHoverPreviewEnabled={false}
                        sizeClassName="w-[84px] h-[84px]"
                        onThumbnailClick={() => undefined}
                      />
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-normal text-discord-text">
                      {item.categoryName}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-discord-text">{item.label}</span>
                  </span>
                </>
              );

              if (!category || !onSelectRecord) {
                return (
                  <div
                    key={item.id}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-discord-text"
                    title={item.label}
                  >
                    {content}
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRecord(item.record, category)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                  title={item.label}
                >
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {paged.total > 0 && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-gray-700 px-3 py-2">
          <span className="text-[11px] text-discord-muted">
            {paged.start.toLocaleString()}-{paged.end.toLocaleString()} / {paged.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-7 w-7 p-0 border-gray-600 hover:bg-discord-hover"
              disabled={paged.currentPage <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-7 w-7 p-0 border-gray-600 hover:bg-discord-hover"
              disabled={paged.currentPage >= paged.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
};
