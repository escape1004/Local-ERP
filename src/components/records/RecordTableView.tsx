import React from 'react';
import { SortAsc, SortDesc } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../ui/context-menu';
import { Input } from '../ui/input';
import type { Category, DataRecord, FieldDefinition } from '../../types';
import type { FieldValue } from '../../lib/recordFields';
import { getPercentageMeta, getPercentageTextClassName } from '../../lib/recordFields';
import { resolveFilePath } from '../../lib/pathResolver';
import { FieldValueRenderer } from './FieldValueRenderer';
import { RecordActionsMenu } from './RecordActions';
import { ThumbnailCell, type ThumbnailPreviewState } from './ThumbnailCell';

interface RecordTableViewProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  tableRef: React.RefObject<HTMLTableElement | null>;
  paginatedRecords: DataRecord[];
  visibleFields: FieldDefinition[];
  fileField?: FieldDefinition;
  hasIncomingReferences: boolean;
  selectedRecordId: string | null;
  selectedCategoryId: string;
  categories: Category[];
  getCategoryRecords: (categoryId: string) => DataRecord[];
  getRecordFieldValue: (record: DataRecord, fieldId: string) => FieldValue;
  getRecordReferenceCount: (recordId: string, categoryId: string) => number;
  getColumnWidth: (fieldId: string) => number;
  isResizing: string | null;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  listThumbnailFit: 'cover' | 'contain';
  videoHoverPreviewEnabled: boolean;
  onSort: (fieldId: string) => void;
  onResizeStart: (fieldId: string, event: React.MouseEvent) => void;
  onSelectRecord: (recordId: string) => void;
  onView: (record: DataRecord) => void;
  onEdit: (record: DataRecord) => void;
  onDelete: (event: Event | React.SyntheticEvent, record: DataRecord) => void | Promise<void>;
  onViewRelatedRecord: (record: DataRecord, category: Category) => void;
  onThumbnailClick: (filePath: string, record: DataRecord) => void;
  onPreviewChange: (preview: ThumbnailPreviewState | null) => void;
  onInlinePercentageChange: (record: DataRecord, field: FieldDefinition, nextValue: string) => void;
}

export const RecordTableView: React.FC<RecordTableViewProps> = ({
  tableContainerRef,
  tableRef,
  paginatedRecords,
  visibleFields,
  fileField,
  hasIncomingReferences,
  selectedRecordId,
  selectedCategoryId,
  categories,
  getCategoryRecords,
  getRecordFieldValue,
  getRecordReferenceCount,
  getColumnWidth,
  isResizing,
  sortField,
  sortDirection,
  listThumbnailFit,
  videoHoverPreviewEnabled,
  onSort,
  onResizeStart,
  onSelectRecord,
  onView,
  onEdit,
  onDelete,
  onViewRelatedRecord,
  onThumbnailClick,
  onPreviewChange,
  onInlinePercentageChange,
}) => (
  <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-auto discord-scrollbar">
    <table ref={tableRef} className="w-full table-fixed">
      <thead className="sticky top-0 z-10 bg-discord-sidebar border-b border-gray-700">
        <tr>
          {fileField && (
            <th
              className="px-2 py-2 text-left text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover relative"
              style={{ width: `${getColumnWidth('__thumbnail')}px` }}
              onClick={() => onSort('__thumbnail')}
            >
              <div className="flex items-center gap-1 select-none">
                썸네일
                {sortField === '__thumbnail' && (
                  sortDirection === 'asc' ? <SortAsc size={16} className="text-white" /> : <SortDesc size={16} className="text-white" />
                )}
              </div>
              <div
                className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-colors ${
                  isResizing === '__thumbnail' ? 'bg-discord-accent' : 'bg-transparent hover:bg-discord-accent'
                }`}
                style={{ right: '0px' }}
                onMouseDown={(event) => onResizeStart('__thumbnail', event)}
              />
            </th>
          )}
          {visibleFields.map((field) => (
            <th
              key={field.id}
              className={
                field.type === 'checkbox'
                  ? 'px-2 py-2 text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover text-left truncate relative'
                  : 'px-2 py-2 text-left text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover relative'
              }
              style={{ width: `${getColumnWidth(field.id)}px` }}
              onClick={() => onSort(field.id)}
            >
              <div className="flex items-center gap-1 select-none">
                {field.name}
                {sortField === field.id && (
                  sortDirection === 'asc' ? <SortAsc size={16} className="text-white" /> : <SortDesc size={16} className="text-white" />
                )}
              </div>
              <div
                className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-colors ${
                  isResizing === field.id ? 'bg-discord-accent' : 'bg-transparent hover:bg-discord-accent'
                }`}
                style={{ right: '0px' }}
                onMouseDown={(event) => onResizeStart(field.id, event)}
              />
            </th>
          ))}
          {hasIncomingReferences && (
            <th
              className="px-2 py-2 text-left text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover relative"
              style={{ width: `${getColumnWidth('__refCount')}px` }}
              onClick={() => onSort('__refCount')}
            >
              <div className="flex items-center gap-1 select-none">
                참조 횟수
                {sortField === '__refCount' && (
                  sortDirection === 'asc' ? <SortAsc size={16} className="text-white" /> : <SortDesc size={16} className="text-white" />
                )}
              </div>
              <div
                className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-colors ${
                  isResizing === '__refCount' ? 'bg-discord-accent' : 'bg-transparent hover:bg-discord-accent'
                }`}
                style={{ right: '0px' }}
                onMouseDown={(event) => onResizeStart('__refCount', event)}
              />
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {paginatedRecords.map((record) => (
          <ContextMenu key={record.id}>
            <ContextMenuTrigger asChild>
              <tr
                data-record-id={record.id}
                className={`${selectedRecordId === record.id ? 'bg-discord-hover' : 'hover:bg-discord-hover'} group cursor-default`}
                onClick={() => onSelectRecord(record.id)}
                onDoubleClick={() => {
                  onSelectRecord(record.id);
                  onView(record);
                }}
              >
                {fileField && (
                  <td className="px-2 py-3 text-xs text-discord-text overflow-hidden relative" style={{ width: `${getColumnWidth('__thumbnail')}px` }}>
                    <ThumbnailCell
                      filePath={resolveFilePath(record.data[fileField.id], fileField) || undefined}
                      record={record}
                      thumbnailFit={listThumbnailFit}
                      thumbnailOnly={fileField.thumbnailOnly}
                      videoHoverPreviewEnabled={videoHoverPreviewEnabled}
                      fileExtensionAlign="left"
                      onPreviewChange={onPreviewChange}
                      onThumbnailClick={(filePath) => onThumbnailClick(filePath, record)}
                    />
                  </td>
                )}
                {visibleFields.map((field) => (
                  <td
                    key={field.id}
                    className={`${
                      field.type === 'checkbox'
                        ? 'px-2 py-3 text-xs text-discord-text text-left overflow-hidden'
                        : field.type === 'percentage'
                          ? 'px-2 py-2 text-xs text-discord-text'
                          : 'px-2 py-3 text-xs text-discord-text overflow-hidden'
                    }`}
                    style={{ width: `${getColumnWidth(field.id)}px` }}
                  >
                    {field.type === 'file' && field.thumbnailOnly
                      ? ''
                      : field.type === 'percentage'
                        ? (() => {
                            const currentValue = getRecordFieldValue(record, field.id);
                            const percentage = getPercentageMeta(field, currentValue);
                            const rawValue = currentValue && typeof currentValue === 'object' ? percentage.value : 0;
                            const rawMax = currentValue && typeof currentValue === 'object' ? percentage.max : 0;
                            return (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={rawValue}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectRecord(record.id);
                                  }}
                                  onFocus={() => onSelectRecord(record.id)}
                                  onChange={(event) => {
                                    void onInlinePercentageChange(record, field, event.target.value);
                                  }}
                                  className="h-8 min-w-0 bg-discord-sidebar border-gray-600 text-discord-text"
                                />
                                <span className="text-discord-muted">/</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={rawMax}
                                  readOnly
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectRecord(record.id);
                                  }}
                                  onFocus={() => onSelectRecord(record.id)}
                                  className="h-8 min-w-0 bg-discord-sidebar/70 border-gray-600 text-discord-muted cursor-default"
                                />
                                <span className={`min-w-[42px] text-right ${getPercentageTextClassName(percentage.percent)}`}>
                                  {percentage.percent}%
                                </span>
                              </div>
                            );
                          })()
                        : (
                          <FieldValueRenderer
                            variant="list"
                            field={field}
                            value={getRecordFieldValue(record, field.id)}
                            categories={categories}
                            getCategoryRecords={getCategoryRecords}
                            recordData={record.data as Record<string, unknown>}
                            onSelectRow={() => onSelectRecord(record.id)}
                            onViewRelatedRecord={onViewRelatedRecord}
                          />
                        )}
                  </td>
                ))}
                {hasIncomingReferences && (
                  <td className="px-2 py-3 text-xs text-discord-text text-left overflow-hidden" style={{ width: `${getColumnWidth('__refCount')}px` }}>
                    {getRecordReferenceCount(record.id, selectedCategoryId)}
                  </td>
                )}
              </tr>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <RecordActionsMenu
                record={record}
                hideViewItem
                onSelect={(nextRecord) => onSelectRecord(nextRecord.id)}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </tbody>
    </table>
  </div>
);
