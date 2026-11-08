import React from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../ui/context-menu';
import type { Category, DataRecord, FieldDefinition } from '../../types';
import type { FieldValue } from '../../lib/recordFields';
import { resolveFilePath } from '../../lib/pathResolver';
import { cn } from '../../lib/utils';
import { FieldValueRenderer, renderGalleryCopyableText } from './FieldValueRenderer';
import { RecordActionsMenu } from './RecordActions';
import { ThumbnailCell } from './ThumbnailCell';

interface RecordGalleryViewProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  paginatedRecords: DataRecord[];
  galleryTitleField?: FieldDefinition | null;
  galleryDetailFields: FieldDefinition[];
  fileField?: FieldDefinition;
  selectedRecordId: string | null;
  selectedCategoryId: string;
  categories: Category[];
  getCategoryRecords: (categoryId: string) => DataRecord[];
  getRecordFieldValue: (record: DataRecord, fieldId: string) => FieldValue;
  getGalleryFieldText: (record: DataRecord, field: FieldDefinition) => string;
  galleryCardMinWidth: number;
  galleryThumbnailHeight: number;
  galleryZoom: number;
  galleryZoomFeedbackVisible: boolean;
  listThumbnailFit: 'cover' | 'contain';
  videoHoverPreviewEnabled: boolean;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onSelectRecord: (recordId: string) => void;
  onView: (record: DataRecord) => void;
  onEdit: (record: DataRecord) => void;
  onDelete: (event: Event | React.SyntheticEvent, record: DataRecord) => void | Promise<void>;
  onViewRelatedRecord: (record: DataRecord, category: Category) => void;
  onThumbnailClick: (filePath: string, record: DataRecord) => void;
}

export const RecordGalleryView: React.FC<RecordGalleryViewProps> = ({
  tableContainerRef,
  paginatedRecords,
  galleryTitleField,
  galleryDetailFields,
  fileField,
  selectedRecordId,
  categories,
  getCategoryRecords,
  getRecordFieldValue,
  getGalleryFieldText,
  galleryCardMinWidth,
  galleryThumbnailHeight,
  galleryZoom,
  galleryZoomFeedbackVisible,
  listThumbnailFit,
  videoHoverPreviewEnabled,
  onWheel,
  onSelectRecord,
  onView,
  onEdit,
  onDelete,
  onViewRelatedRecord,
  onThumbnailClick,
}) => (
  <div
    ref={tableContainerRef}
    className="relative flex-1 min-h-0 overflow-auto discord-scrollbar px-6 py-6"
    onWheel={onWheel}
  >
    {galleryZoomFeedbackVisible && (
      <div className="pointer-events-none absolute bottom-6 right-6 z-20">
        <div className="rounded-md border border-gray-600 bg-discord-sidebar/95 px-3 py-1.5 text-xs font-medium text-discord-text shadow-lg backdrop-blur-sm">
          갤러리 크기 {galleryZoom}%
        </div>
      </div>
    )}
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${galleryCardMinWidth}px, 1fr))` }}
    >
      {paginatedRecords.map((record) => {
        const title = galleryTitleField ? getGalleryFieldText(record, galleryTitleField) : record.id;
        const selectGalleryRecord = () => onSelectRecord(record.id);
        return (
          <ContextMenu key={record.id}>
            <ContextMenuTrigger asChild>
              <article
                data-record-id={record.id}
                className={cn(
                  'group overflow-hidden rounded-xl border bg-discord-sidebar/70 shadow-sm transition-colors',
                  selectedRecordId === record.id
                    ? 'border-discord-accent bg-discord-hover'
                    : 'border-gray-700 hover:border-gray-500 hover:bg-discord-hover'
                )}
                onClick={() => onSelectRecord(record.id)}
                onDoubleClick={() => {
                  onSelectRecord(record.id);
                  onView(record);
                }}
              >
                <div className="border-b border-gray-800 bg-black/20 p-3">
                  <ThumbnailCell
                    filePath={resolveFilePath(record.data[fileField?.id || ''], fileField) || undefined}
                    record={record}
                    thumbnailFit={listThumbnailFit}
                    thumbnailOnly={fileField?.thumbnailOnly}
                    sizeClassName="w-full"
                    sizeStyle={{ height: `${galleryThumbnailHeight}px` }}
                    videoHoverPreviewEnabled={videoHoverPreviewEnabled}
                    inlineVideoPreview
                    fileExtensionAlign="left"
                    showVideoDuration
                    onPreviewChange={undefined}
                    onThumbnailClick={(filePath) => onThumbnailClick(filePath, record)}
                  />
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <div className="min-w-0 text-sm font-semibold text-discord-text">
                      {galleryTitleField
                        ? (
                          <FieldValueRenderer
                            variant="list"
                            field={galleryTitleField}
                            value={getRecordFieldValue(record, galleryTitleField.id)}
                            categories={categories}
                            getCategoryRecords={getCategoryRecords}
                            recordData={record.data as Record<string, unknown>}
                            onSelectRow={selectGalleryRecord}
                            onViewRelatedRecord={onViewRelatedRecord}
                          />
                        )
                        : renderGalleryCopyableText(
                          title,
                          '값이 클립보드에 복사되었습니다.',
                          selectGalleryRecord,
                          'inline-block max-w-full truncate rounded px-1 py-0.5 transition-colors hover:bg-discord-hover/50',
                        )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {galleryDetailFields.map((field) => (
                      <div key={field.id} className="flex items-center gap-3 text-xs">
                        <span className="shrink-0 self-center text-discord-muted">{field.name} :</span>
                        <div className="min-w-0 flex-1 text-discord-text">
                          <FieldValueRenderer
                            variant="list"
                            field={field}
                            value={getRecordFieldValue(record, field.id)}
                            categories={categories}
                            getCategoryRecords={getCategoryRecords}
                            recordData={record.data as Record<string, unknown>}
                            onSelectRow={selectGalleryRecord}
                            onViewRelatedRecord={onViewRelatedRecord}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <RecordActionsMenu
                record={record}
                onSelect={(nextRecord) => onSelectRecord(nextRecord.id)}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  </div>
);
