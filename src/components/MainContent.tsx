import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Filter, X, FileText, Check, ChevronsUpDown, LayoutGrid, TableProperties, Archive, Info, HelpCircle, ImageOff } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { DataRecord, FieldDefinition, Category } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';
import { ViewerModal } from './ViewerModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { DatabaseViewer } from './DatabaseViewer';
import { toast } from './ui/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { ConfirmDialog } from './ui/confirm-dialog';
import { AlertDialog } from './ui/alert-dialog';
import { CategoryModal } from './CategoryModal';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { BulkAddModal } from './BulkAddModal';
import { resolveFilePath } from '../lib/pathResolver';
import { formatFieldDisplayValue } from '../lib/fieldFormat';
import { DatePicker } from './ui/date-picker';
import { cn } from '../lib/utils';
import {
  getFieldOptions,
  getPercentageMeta,
  isFieldMultiple,
  parseNonNegativeNumberInput,
  type ListFileType,
} from '../lib/recordFields';
import { getNextSortState } from '../lib/recordQuery';
import { useRecordListKeyboard } from '../hooks/useRecordListKeyboard';
import { useRecordQuery } from '../hooks/useRecordQuery';
import { FIELD_TOOLTIP_CLASSNAME } from './records/FieldValueRenderer';
import { RecordGalleryView } from './records/RecordGalleryView';
import { RecordTableView } from './records/RecordTableView';
import { HoverVideoPreview } from './records/ThumbnailCell';
import { getTranslatedFieldId, isTranslationEnabledField } from '../lib/translation';

declare global {
  interface WindowEventMap {
    'erp:categoryChange': CustomEvent<{ categoryId: string }>;
    'thumbnail:regenerated': CustomEvent<{ filePath: string; customThumbnail?: boolean }>;
    'config:updated': CustomEvent<{
      listThumbnailFit?: 'cover' | 'contain';
      videoHoverPreviewEnabled?: boolean;
      thumbnailPreviewScale?: number;
      defaultGalleryZoom?: number;
    }>;
  }
}

export const MainContent: React.FC = () => {
  const {
    categories,
    records: recordsByCategory,
    selectedCategoryId,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    deleteRecord,
    getCategoryRecords,
    loadRecords,
    invalidateCache,
    selectCategory,
    showDbViewer,
    pendingRecordFocus,
    clearPendingRecordFocus,
  } = useERPStore();

  const {
    showLoading,
    hideLoading,
    setLoading: setGlobalLoading,
  } = useLoadingStore();

  // 검색어를 로컬 상태로 관리
  const [searchTerm, setSearchTerm] = useState('');
  const [multiSearchTerms, setMultiSearchTerms] = useState<string[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchField, setSearchField] = useState<string>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all'); // 'all', 'image', 'video', 'archive'
  const [multiSelectSearchOpen, setMultiSelectSearchOpen] = useState(false);
  const [recordListView, setRecordListView] = useState<'table' | 'gallery'>('table');
  const [galleryVisibleFieldIds, setGalleryVisibleFieldIds] = useState<string[]>([]);

  // 컬럼 너비 관리 (카테고리별로 저장)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const [inlinePercentageOverrides, setInlinePercentageOverrides] = useState<Record<string, { value: number; max: number }>>({});
  const inlinePercentageRequestRef = useRef<Record<string, number>>({});

  const categoriesSafe = useMemo(() => categories ?? [], [categories]);
  const categoryById = useMemo(
    () => new Map(categoriesSafe.map((category) => [category.id, category])),
    [categoriesSafe]
  );
  const recordsByIdByCategory = useMemo(() => {
    const result = new Map<string, Map<string, DataRecord>>();
    Object.entries(recordsByCategory).forEach(([categoryId, categoryRecords]) => {
      result.set(categoryId, new Map(categoryRecords.map((record) => [record.id, record])));
    });
    return result;
  }, [recordsByCategory]);
  const selectedCategorySafe = useMemo(
    () => (selectedCategoryId ? categoryById.get(selectedCategoryId) ?? null : null),
    [categoryById, selectedCategoryId]
  );
  const currentRecordsSafe = useMemo(
    () => (selectedCategoryId ? recordsByCategory[selectedCategoryId] ?? [] : []),
    [recordsByCategory, selectedCategoryId],
  );
  const getInlinePercentageKey = useCallback((recordId: string, fieldId: string) => `${recordId}:${fieldId}`, []);

  useEffect(() => {
    if (selectedCategoryId && categoriesSafe.length > 0 && !selectedCategorySafe) {
      selectCategory(null);
    }
  }, [selectedCategoryId, selectedCategorySafe, selectCategory, categoriesSafe.length]);

  const getRecordFieldValue = useCallback((record: DataRecord, fieldId: string) => {
    const overrideKey = getInlinePercentageKey(record.id, fieldId);
    if (Object.prototype.hasOwnProperty.call(inlinePercentageOverrides, overrideKey)) {
      return inlinePercentageOverrides[overrideKey];
    }
    return record.data[fieldId];
  }, [getInlinePercentageKey, inlinePercentageOverrides]);

  const updateInlinePercentageValue = useCallback(async (
    record: DataRecord,
    field: FieldDefinition,
    nextRawValue: string
  ) => {
    const overrideKey = getInlinePercentageKey(record.id, field.id);
    const currentValue = getRecordFieldValue(record, field.id);
    const normalizedCurrent = currentValue && typeof currentValue === 'object'
      ? currentValue
      : { value: 0, max: 0 };
    const maxValue = Math.max(0, Number(normalizedCurrent.max || 0));
    const nextValue = {
      ...normalizedCurrent,
      value: Math.min(parseNonNegativeNumberInput(nextRawValue), maxValue),
      max: maxValue
    };

    setInlinePercentageOverrides((prev) => ({
      ...prev,
      [overrideKey]: nextValue
    }));

    const requestId = (inlinePercentageRequestRef.current[overrideKey] || 0) + 1;
    inlinePercentageRequestRef.current[overrideKey] = requestId;

    try {
      await window.electronAPI.updateRecord(record.id, {
        ...record.data,
        [field.id]: nextValue
      });
      if (inlinePercentageRequestRef.current[overrideKey] === requestId) {
        record.data[field.id] = nextValue;
      }
    } catch (error) {
      if (inlinePercentageRequestRef.current[overrideKey] === requestId) {
        const fallback = getPercentageMeta(field, record.data[field.id]);
        setInlinePercentageOverrides((prev) => ({
          ...prev,
          [overrideKey]: { value: fallback.value, max: fallback.max }
        }));
        toast({
          title: '저장 실패',
          description: `${field.name} 값을 저장하지 못했습니다.`,
          variant: 'destructive'
        });
      }
    }
  }, [getInlinePercentageKey, getRecordFieldValue]);

  const recordReferenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const currentCategory = selectedCategoryId ? categoryById.get(selectedCategoryId) : null;
    if (!currentCategory?.parentId) return counts;

    const parentCategory = categoryById.get(currentCategory.parentId);
    if (!parentCategory) return counts;

    const relationFields = parentCategory.fields.filter(
      (field) => field.type === 'relation' && field.relationCategoryId === currentCategory.id
    );
    if (relationFields.length === 0) return counts;

    (recordsByCategory[parentCategory.id] ?? []).forEach((record) => {
      relationFields.forEach((field) => {
        const value = record.data[field.id];
        if (field.multiple && Array.isArray(value)) {
          value.forEach((recordId) => {
            if (typeof recordId === 'string') {
              counts.set(recordId, (counts.get(recordId) ?? 0) + 1);
            }
          });
        } else if (typeof value === 'string') {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      });
    });

    return counts;
  }, [categoryById, recordsByCategory, selectedCategoryId]);

  const getRecordReferenceCount = useCallback(
    (recordId: string, categoryId: string) => (
      categoryId === selectedCategoryId ? recordReferenceCounts.get(recordId) ?? 0 : 0
    ),
    [recordReferenceCounts, selectedCategoryId]
  );
  
  // 카테고리별 컬럼 너비 불러오기
  useEffect(() => {
    if (selectedCategoryId) {
      const savedWidths = localStorage.getItem(`columnWidths_${selectedCategoryId}`);
      if (savedWidths) {
        try {
          const widths = JSON.parse(savedWidths);
          setColumnWidths(widths);
        } catch (e) {
          console.error('컬럼 너비 불러오기 실패:', e);
        }
      } else {
        setColumnWidths({});
      }
    }
  }, [selectedCategoryId]);

  // 컬럼 너비 변경 시 저장
  useEffect(() => {
    if (selectedCategoryId && Object.keys(columnWidths).length > 0) {
      localStorage.setItem(`columnWidths_${selectedCategoryId}`, JSON.stringify(columnWidths));
    }
  }, [columnWidths, selectedCategoryId]);

  // Reset search field to 'all' when category changes
  useEffect(() => {
    setSearchField('all');
    setSearchTerm(''); // Reset search term when category changes
    setMultiSearchTerms([]);
    setCurrentPage(1); // Reset pagination when category changes
    setSortField(''); // Reset sort field when category changes
    setSortDirection('asc'); // Reset sort direction when category changes
    setFileTypeFilter('all'); // Reset file type filter when category changes
    setInlinePercentageOverrides({});
    scrollTableToTop(); // Reset scroll position when category changes
  }, [selectedCategoryId, setCurrentPage]);

  useEffect(() => {
    setMultiSelectSearchOpen(false);
  }, [selectedCategoryId, searchField]);

  // Reset pagination to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, multiSearchTerms, searchField, fileTypeFilter, setCurrentPage]);

  // Load related records when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const category = categoryById.get(selectedCategoryId);
      if (category) {
        const relationFields = category.fields.filter(field => field.type === 'relation');
        const loadedCategories = new Set();
        const categoriesToLoad: string[] = [];
        
        // 이미 로드되지 않은 관계형 카테고리만 찾기
        relationFields.forEach(field => {
          if (field.relationCategoryId && !loadedCategories.has(field.relationCategoryId)) {
            // 이미 메모리에 로드된 카테고리인지 확인
            const existingRecords = getCategoryRecords(field.relationCategoryId);
            if (!existingRecords || existingRecords.length === 0) {
              categoriesToLoad.push(field.relationCategoryId);
            }
            loadedCategories.add(field.relationCategoryId);
          }
        });
        
        // 로드할 카테고리가 있으면 백그라운드에서 로드 (로딩 표시 없이)
        if (categoriesToLoad.length > 0) {
          const loadPromises = categoriesToLoad.map(categoryId => loadRecords(categoryId));
          Promise.all(loadPromises).catch((error) => {
            console.error('카테고리 로드 중 오류:', error);
          });
        }
      }
    }
  }, [selectedCategoryId, categoryById, loadRecords, getCategoryRecords]);

  const visibleFields = useMemo(
    () => selectedCategorySafe?.fields.filter((field) => !field.hidden) ?? [],
    [selectedCategorySafe]
  );
  const selectedCategoryFieldMap = useMemo(
    () => new Map((selectedCategorySafe?.fields ?? []).map((field) => [field.id, field])),
    [selectedCategorySafe]
  );
  const translatedSearchField = useMemo(
    () => visibleFields.find(
      (field) => isTranslationEnabledField(field) && getTranslatedFieldId(field.id) === searchField
    ) ?? null,
    [visibleFields, searchField]
  );
  const selectedSearchField = useMemo(
    () => selectedCategoryFieldMap.get(searchField) ?? translatedSearchField,
    [selectedCategoryFieldMap, searchField, translatedSearchField]
  );
  const selectedSearchFieldLabel = translatedSearchField
    ? `${translatedSearchField.name} (번역)`
    : selectedSearchField?.name ?? '';
  const effectiveSearchField = (selectedSearchField || searchField === 'all') ? searchField : 'all';
  const isMultiValueSearchField = Boolean(
    selectedSearchField
    && (selectedSearchField.type === 'select' || selectedSearchField.type === 'relation')
    && isFieldMultiple(selectedSearchField)
  );
  const relationSearchOptions = useMemo(() => {
    if (!selectedSearchField || selectedSearchField.type !== 'relation' || !selectedSearchField.relationCategoryId) {
      return [];
    }

    const relatedCategory = categoryById.get(selectedSearchField.relationCategoryId);
    if (!relatedCategory) {
      return [];
    }

    const relatedRecords = getCategoryRecords(selectedSearchField.relationCategoryId);
    const displayField = selectedSearchField.displayFieldId
      ? relatedCategory.fields.find((field) => field.id === selectedSearchField.displayFieldId)
      : relatedCategory.fields[0];

    return Array.from(
      new Set(
        relatedRecords
          .map((record) => String(record.data[displayField?.id] || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [selectedSearchField, categoryById, getCategoryRecords]);
  const normalizedMultiSearchTerms = useMemo(
    () => multiSearchTerms.map((term) => term.trim().toLowerCase()).filter(Boolean),
    [multiSearchTerms]
  );
  const hasActiveSearch = isMultiValueSearchField
    ? multiSearchTerms.length > 0
    : searchTerm.trim().length > 0;
  const multiSearchLabel = multiSearchTerms.length === 0
    ? ''
    : multiSearchTerms.join(', ');
  const toggleMultiSearchTerm = useCallback((term: string) => {
    setMultiSearchTerms((prev) => (
      prev.includes(term)
        ? prev.filter((item) => item !== term)
        : [...prev, term]
    ));
  }, []);

  // 기본 컬럼 너비 반환
  const getDefaultColumnWidth = useCallback((columnId: string): number => {
    if (columnId === '__thumbnail') return 112;
    if (columnId === '__refCount') return 96;
    return 150; // 기본 필드 너비
  }, []);

  // 컬럼 리사이즈 핸들러
  const handleResizeStart = useCallback((columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(columnId);
    setResizeStartX(e.clientX);
    const currentWidth = columnWidths[columnId] || getDefaultColumnWidth(columnId);
    setResizeStartWidth(currentWidth);
  }, [columnWidths, getDefaultColumnWidth]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const diff = e.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + diff); // 최소 너비 50px
    setColumnWidths(prev => ({
      ...prev,
      [isResizing]: newWidth
    }));
  }, [isResizing, resizeStartX, resizeStartWidth]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // 컬럼 너비 가져오기
  const getColumnWidth = useCallback((columnId: string): number => {
    return columnWidths[columnId] || getDefaultColumnWidth(columnId);
  }, [columnWidths, getDefaultColumnWidth]);

  // 파일 필드 존재 여부
  const fileField = selectedCategorySafe?.fields.find(f => f.type === 'file');
  const supportsGalleryView = Boolean(fileField);
  const showGalleryView = supportsGalleryView && recordListView === 'gallery';
  const galleryTitleField = useMemo(
    () => visibleFields.find((field) => field.type !== 'file') ?? null,
    [visibleFields]
  );
  const gallerySelectableFields = useMemo(
    () => visibleFields.filter((field) => field.type !== 'file' && field.id !== galleryTitleField?.id),
    [visibleFields, galleryTitleField]
  );
  const galleryDetailFields = useMemo(
    () => gallerySelectableFields.filter((field) => galleryVisibleFieldIds.includes(field.id)),
    [gallerySelectableFields, galleryVisibleFieldIds]
  );
  const hasIncomingReferences = useMemo(
    () => Boolean(
      selectedCategorySafe && categoriesSafe.some((cat) =>
        cat.fields.some((field) => field.type === 'relation' && field.relationCategoryId === selectedCategorySafe.id)
      )
    ),
    [categoriesSafe, selectedCategorySafe]
  );

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) {
      setGalleryVisibleFieldIds([]);
      return;
    }

    const storageKey = `galleryVisibleFields_${selectedCategoryId}`;
    const savedFieldIds = localStorage.getItem(storageKey);

    if (savedFieldIds) {
      try {
        const parsed = JSON.parse(savedFieldIds);
        if (Array.isArray(parsed)) {
          const validFieldIds = gallerySelectableFields
            .map((field) => field.id)
            .filter((fieldId) => parsed.includes(fieldId));
          setGalleryVisibleFieldIds(validFieldIds);
          return;
        }
      } catch {
        // Ignore malformed persisted gallery preferences and fall back to defaults.
      }
    }

    setGalleryVisibleFieldIds(gallerySelectableFields.slice(0, 4).map((field) => field.id));
  }, [selectedCategoryId, supportsGalleryView, gallerySelectableFields]);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;
    localStorage.setItem(`galleryVisibleFields_${selectedCategoryId}`, JSON.stringify(galleryVisibleFieldIds));
  }, [selectedCategoryId, supportsGalleryView, galleryVisibleFieldIds]);

  useEffect(() => {
    if (!fileField) {
      setRecordListView('table');
    }
  }, [fileField]);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;

    const savedView = localStorage.getItem(`recordListView_${selectedCategoryId}`);
    if (savedView === 'gallery' || savedView === 'table') {
      setRecordListView(savedView);
      return;
    }

    setRecordListView('table');
  }, [selectedCategoryId, supportsGalleryView]);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;
    localStorage.setItem(`recordListView_${selectedCategoryId}`, recordListView);
  }, [selectedCategoryId, supportsGalleryView, recordListView]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const { sortedRecords } = useRecordQuery({
    records: selectedCategoryId ? currentRecordsSafe : [],
    searchTerm,
    normalizedSearchTerm,
    normalizedMultiSearchTerms,
    effectiveSearchField,
    isMultiValueSearchField,
    hasActiveSearch,
    fileTypeFilter: fileTypeFilter as ListFileType | 'all',
    sortField,
    sortDirection,
    fileField,
    visibleFields,
    fieldMap: selectedCategoryFieldMap,
    categoryById,
    recordsByIdByCategory,
    getRecordFieldValue,
    getRecordReferenceCount,
    categoryId: selectedCategorySafe?.id || '',
  });

  // Pagination
  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = sortedRecords.slice(startIndex, startIndex + itemsPerPage);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollTableToTop = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    if (!pendingRecordFocus) return;
    if (pendingRecordFocus.categoryId !== selectedCategoryId) return;

    setSearchField('all');
    setSearchTerm('');
    setFileTypeFilter('all');

    const targetIndex = sortedRecords.findIndex((record) => record.id === pendingRecordFocus.recordId);
    if (targetIndex < 0) return;

    const targetPage = Math.floor(targetIndex / itemsPerPage) + 1;
    if (currentPage !== targetPage) {
      setCurrentPage(targetPage);
      return;
    }

    setSelectedRecordId(pendingRecordFocus.recordId);
    clearPendingRecordFocus();

    requestAnimationFrame(() => {
      const targetRow = tableContainerRef.current?.querySelector<HTMLElement>(
        `[data-record-id="${pendingRecordFocus.recordId}"]`
      );
      targetRow?.scrollIntoView({ block: 'center' });
    });
  }, [
    pendingRecordFocus,
    selectedCategoryId,
    sortedRecords,
    itemsPerPage,
    currentPage,
    setCurrentPage,
    clearPendingRecordFocus,
  ]);

  // 썸네일 생성/삭제 시 레코드 리스트 강제 리로드
  useEffect(() => {
    const handler = () => {
      if (selectedCategoryId) {
        showLoading('썸네일 업데이트 중...', 15000, true); // 15초 타임아웃, 취소 버튼 표시
        loadRecords(selectedCategoryId, { force: true }).finally(() => {
          hideLoading();
        });
      }
    };
    window.addEventListener('thumbnail:regenerated', handler);
    return () => window.removeEventListener('thumbnail:regenerated', handler);
  }, [selectedCategoryId, loadRecords, showLoading, hideLoading]);

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [viewingCategory, setViewingCategory] = useState<string>('');
  const [expandedTags, setExpandedTags] = useState<{[key: string]: boolean}>({});
  const [csvDropdownOpen, setCsvDropdownOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [alertDialogProps, setAlertDialogProps] = useState<{
    title: string;
    message: string;
    variant: 'error' | 'warning' | 'info' | 'success';
  }>({
    title: '',
    message: '',
    variant: 'info'
  });
  const [recordToDelete, setRecordToDelete] = useState<DataRecord | null>(null);
  const [isPageInputMode, setIsPageInputMode] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<{
    dataUrl: string | null;
    filePath: string;
    missingFile: boolean;
    thumbnailFit: 'cover' | 'contain';
    isVideo: boolean;
  } | null>(null);
  const [thumbnailPreviewScale, setThumbnailPreviewScale] = useState(100);
  const [galleryZoom, setGalleryZoom] = useState(100);
  const [defaultGalleryZoom, setDefaultGalleryZoom] = useState(100);
  const [galleryZoomFeedbackVisible, setGalleryZoomFeedbackVisible] = useState(false);
  const galleryZoomFeedbackTimeoutRef = useRef<number | null>(null);

  // 뷰어 모달 상태
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerFilePath, setViewerFilePath] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<'image' | 'video' | 'archive' | null>(null);
  const [viewerCategoryId, setViewerCategoryId] = useState<string>('');
  const [viewerRecordId, setViewerRecordId] = useState<string>('');
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [listThumbnailFit, setListThumbnailFit] = useState<'cover' | 'contain'>('cover');
  const [videoHoverPreviewEnabled, setVideoHoverPreviewEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    window.electronAPI.getConfig().then((config) => {
      if (!cancelled) {
        setListThumbnailFit(config?.listThumbnailFit === 'contain' ? 'contain' : 'cover');
        setVideoHoverPreviewEnabled(config?.videoHoverPreviewEnabled !== false);
        setThumbnailPreviewScale(Math.min(200, Math.max(75, Number(config?.thumbnailPreviewScale ?? 100))));
        setDefaultGalleryZoom(Math.min(200, Math.max(50, Number(config?.defaultGalleryZoom ?? 100))));
      }
    }).catch(() => {
      if (!cancelled) {
        setListThumbnailFit('cover');
        setVideoHoverPreviewEnabled(true);
        setThumbnailPreviewScale(100);
        setDefaultGalleryZoom(100);
      }
    });

    const handleConfigUpdated = (event: CustomEvent<{
      listThumbnailFit?: 'cover' | 'contain';
      videoHoverPreviewEnabled?: boolean;
      thumbnailPreviewScale?: number;
      defaultGalleryZoom?: number;
    }>) => {
      if (event.detail.listThumbnailFit) {
        setListThumbnailFit(event.detail.listThumbnailFit);
      }
      if (typeof event.detail.videoHoverPreviewEnabled === 'boolean') {
        setVideoHoverPreviewEnabled(event.detail.videoHoverPreviewEnabled);
      }
      if (event.detail.thumbnailPreviewScale) {
        setThumbnailPreviewScale(Math.min(200, Math.max(75, Number(event.detail.thumbnailPreviewScale))));
      }
      if (event.detail.defaultGalleryZoom) {
        setDefaultGalleryZoom(Math.min(200, Math.max(50, Number(event.detail.defaultGalleryZoom))));
      }
    };

    window.addEventListener('config:updated', handleConfigUpdated as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('config:updated', handleConfigUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;

    const nextKey = `galleryZoomV2_${selectedCategoryId}`;
    const savedZoomV2 = Number(localStorage.getItem(nextKey));
    if (Number.isFinite(savedZoomV2) && savedZoomV2 >= 50 && savedZoomV2 <= 200) {
      setGalleryZoom(savedZoomV2);
      return;
    }

    const legacyZoom = Number(localStorage.getItem(`galleryZoom_${selectedCategoryId}`));
    if (Number.isFinite(legacyZoom) && legacyZoom >= 70 && legacyZoom <= 160) {
      setGalleryZoom(Math.min(200, Math.max(50, legacyZoom - 10)));
      return;
    }

    setGalleryZoom(defaultGalleryZoom);
  }, [selectedCategoryId, supportsGalleryView, defaultGalleryZoom]);

  useEffect(() => {
    if (!showGalleryView) {
      setThumbnailPreview(null);
    }
  }, [showGalleryView]);

  const previewWidth = Math.round(320 * (thumbnailPreviewScale / 100));
  const previewHeight = Math.round(220 * (thumbnailPreviewScale / 100));
  const effectiveGalleryZoom = galleryZoom + 10;
  const galleryCardMinWidth = Math.round(220 * (effectiveGalleryZoom / 100));
  const galleryThumbnailHeight = Math.round(224 * (effectiveGalleryZoom / 100));
  const showGalleryZoomFeedback = useCallback(() => {
    setGalleryZoomFeedbackVisible(true);
    if (galleryZoomFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(galleryZoomFeedbackTimeoutRef.current);
    }
    galleryZoomFeedbackTimeoutRef.current = window.setTimeout(() => {
      setGalleryZoomFeedbackVisible(false);
      galleryZoomFeedbackTimeoutRef.current = null;
    }, 900);
  }, []);

  const handleGalleryWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || !showGalleryView) return;

    event.preventDefault();
    setGalleryZoom((prev) => {
      const next = Math.min(200, Math.max(50, prev + (event.deltaY < 0 ? 10 : -10)));
      if (selectedCategoryId) {
        localStorage.setItem(`galleryZoomV2_${selectedCategoryId}`, String(next));
      }
      return next;
    });
    showGalleryZoomFeedback();
  }, [showGalleryView, showGalleryZoomFeedback, selectedCategoryId]);

  const openRandomCategoryRecord = useCallback(() => {
    const target = document.activeElement as HTMLElement | null;
    const isEditableTarget = !!target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );
    if (isEditableTarget) {
      return;
    }

    if (
      showDbViewer ||
      !selectedCategoryId ||
      !selectedCategorySafe ||
      isRecordModalOpen ||
      isViewModalOpen ||
      viewerModalOpen ||
      isConfirmDialogOpen ||
      isAlertDialogOpen
    ) {
      return;
    }

    if (currentRecordsSafe.length === 0) {
      toast({
        title: '레코드가 없습니다',
        description: '이 카테고리에 레코드가 없어 무작위 열기를 할 수 없습니다.',
      });
      return;
    }

    const record = currentRecordsSafe[Math.floor(Math.random() * currentRecordsSafe.length)];
    setSelectedRecordId(record.id);

    const filePath = fileField
      ? resolveFilePath(record.data[fileField.id], fileField)
      : null;

    if (filePath) {
      setViewerFilePath(filePath);
      setViewerFileType(null);
      setViewerCategoryId(selectedCategorySafe.id);
      setViewerRecordId(record.id);
      setViewerModalOpen(true);
      return;
    }

    setViewingRecord(record);
    setViewingCategory(selectedCategorySafe.id);
    setIsViewModalOpen(true);
  }, [
    showDbViewer,
    selectedCategoryId,
    selectedCategorySafe,
    isRecordModalOpen,
    isViewModalOpen,
    viewerModalOpen,
    isConfirmDialogOpen,
    isAlertDialogOpen,
    currentRecordsSafe,
    fileField,
  ]);

  const openRandomCategoryRecordRef = useRef(openRandomCategoryRecord);
  openRandomCategoryRecordRef.current = openRandomCategoryRecord;

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRandomRecordShortcut?.(() => {
      openRandomCategoryRecordRef.current();
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleEdit = (record: DataRecord) => {
    setEditingRecord(record);
    setIsRecordModalOpen(true);
  };

  const handleView = (record: DataRecord) => {
    setViewingRecord(record);
    setViewingCategory(selectedCategorySafe?.id || '');
    setIsViewModalOpen(true);
  };

  const handleViewRelatedRecord = (record: DataRecord, category: Category) => {
    setViewingRecord(record);
    setViewingCategory(category.id);
    setIsViewModalOpen(true);
  };

  const handleDelete = (record: DataRecord) => {
    setRecordToDelete(record);
    setIsConfirmDialogOpen(true);
  };

  const handleContextMenuDelete = async (event: Event | React.SyntheticEvent, record: DataRecord) => {
    event.stopPropagation();
    setSelectedRecordId(record.id);

    if ('shiftKey' in event && event.shiftKey) {
      await deleteRecord(record.id);
      return;
    }

    handleDelete(record);
  };

  const handleNewRecord = () => {
    setEditingRecord(null);
    setIsRecordModalOpen(true);
  };

  const handleRefreshRecords = () => {
    if (!selectedCategoryId) return;
    showLoading('데이터 새로고침 중...', 30000, true);
    loadRecords(selectedCategoryId).finally(() => {
      hideLoading();
      toast({
        title: "새로고침 완료",
        description: "레코드 목록이 새로고침되었습니다.",
      });
    });
  };

  useRecordListKeyboard({
    disabled: isRecordModalOpen || isViewModalOpen || viewerModalOpen || isConfirmDialogOpen || isAlertDialogOpen,
    selectedCategoryId,
    selectedRecordId,
    paginatedRecords,
    sortedRecords,
    currentPage,
    totalPages,
    searchInputRef,
    onSelectRecord: setSelectedRecordId,
    onNewRecord: handleNewRecord,
    onEditRecord: handleEdit,
    onRefresh: handleRefreshRecords,
    onRandomRecord: openRandomCategoryRecord,
    onPageChange: (page) => {
      setCurrentPage(page);
      scrollTableToTop();
    },
  });

  useEffect(() => {
    if (!selectedRecordId) return;
    const exists = sortedRecords.some(record => record.id === selectedRecordId);
    if (!exists) {
      setSelectedRecordId(null);
    }
  }, [selectedRecordId, sortedRecords]);

  const handleSort = (fieldId: string) => {
    const next = getNextSortState({ sortField, sortDirection }, fieldId);
    setSortField(next.sortField);
    setSortDirection(next.sortDirection);
  };

  const getGalleryFieldText = useCallback((record: DataRecord, field: FieldDefinition): string => {
    const value = getRecordFieldValue(record, field.id);

    if (value === null || value === undefined || value === '' || value === '-') {
      return '-';
    }

    if (Array.isArray(value) && value.length === 0) {
      return '-';
    }

    if (field.type === 'text' || field.type === 'longtext') {
      return String(formatFieldDisplayValue(field, value));
    }

    if (field.type === 'percentage') {
      const percentage = getPercentageMeta(field, value);
      return `${percentage.value} / ${percentage.max} (${percentage.percent}%)`;
    }

    if (field.type === 'checkbox') {
      return value ? '체크됨' : '체크 안 됨';
    }

    if (field.type === 'relation' && field.relationCategoryId) {
      const relatedCategory = categoryById.get(field.relationCategoryId);
      if (!relatedCategory) {
        return String(value);
      }

      const relatedRecordMap = recordsByIdByCategory.get(field.relationCategoryId);
      const displayField = field.displayFieldId
        ? relatedCategory.fields.find((relatedField) => relatedField.id === field.displayFieldId)
        : relatedCategory.fields[0];

      if (Array.isArray(value)) {
        const labels = value
          .map((relatedId) => {
            const relatedRecord = relatedRecordMap?.get(String(relatedId));
            return relatedRecord ? String(relatedRecord.data[displayField?.id] || relatedId) : String(relatedId);
          })
          .filter(Boolean);

        return labels.length > 0 ? labels.join(', ') : '-';
      }

      const relatedRecord = relatedRecordMap?.get(String(value));
      return relatedRecord ? String(relatedRecord.data[displayField?.id] || value) : String(value);
    }

    if (field.type === 'select' && Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }

    return String(value);
  }, [categoryById, recordsByIdByCategory, getRecordFieldValue]);

  const confirmDelete = () => {
    if (recordToDelete) {
      deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
    }
  };

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  const handleExportRecords = async (format: 'csv' | 'xlsx') => {
    if (!selectedCategorySafe) {
      showAlert('내보내기 실패', '먼저 카테고리를 선택해주세요.', 'warning');
      return;
    }

    try {
      const result = await window.electronAPI.exportCategoryRecords(selectedCategorySafe.id, format);

      if (!result.success) {
        if (!result.canceled) {
          showAlert('내보내기 실패', result.error || '파일 내보내기 중 오류가 발생했습니다.', 'error');
        }
        return;
      }

      const formatLabel = result.path?.toLowerCase().endsWith('.zip')
        ? 'CSV ZIP'
        : (format === 'xlsx' ? 'Excel' : 'CSV');
      showAlert(
        '내보내기 완료',
        `${selectedCategorySafe.name} 카테고리의 ${result.recordCount ?? 0}개 레코드를 ${formatLabel} 파일로 저장했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(`Failed to export ${format}:`, error);
      showAlert('내보내기 실패', '파일 내보내기 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleImportRecords = async (format: 'csv' | 'xlsx') => {
    if (!selectedCategorySafe) {
      showAlert('가져오기 실패', '먼저 카테고리를 선택해주세요.', 'warning');
      return;
    }

    try {
      const result = await window.electronAPI.importCategoryRecords(selectedCategorySafe.id, format);

      if (!result.success) {
        if (!result.canceled) {
          showAlert('가져오기 실패', result.error || '파일 가져오기 중 오류가 발생했습니다.', 'error');
        }
        return;
      }

      invalidateCache(selectedCategorySafe.id);
      await loadRecords(selectedCategorySafe.id);

      const details = [
        `저장됨: ${result.importedCount ?? 0}건`,
        `중복으로 건너뜀: ${result.duplicateCount ?? 0}건`,
        `빈 행/해석 불가 행 건너뜀: ${result.skippedCount ?? 0}건`,
      ];

      if (result.unresolvedRelationCount) {
        details.push(`관계형 자동 연결 실패: ${result.unresolvedRelationCount}건`);
      }

      if (result.duplicateFields && result.duplicateFields.length > 0) {
        details.push(`중복 검사 필드: ${result.duplicateFields.join(', ')}`);
      }

      showAlert(
        '가져오기 완료',
        details.join('\n'),
        (result.duplicateCount || result.skippedCount || result.unresolvedRelationCount) ? 'warning' : 'success'
      );
    } catch (error) {
      console.error(`Failed to import ${format}:`, error);
      showAlert('가져오기 실패', '파일 가져오기 중 오류가 발생했습니다.', 'error');
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pageNumber = parseInt(pageInputValue);
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        setCurrentPage(pageNumber);
        setIsPageInputMode(false);
        setPageInputValue('');
        scrollTableToTop();
      }
    } else if (e.key === 'Escape') {
      setIsPageInputMode(false);
      setPageInputValue('');
    }
  };

  const handlePageInputBlur = () => {
    const pageNumber = parseInt(pageInputValue);
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      scrollTableToTop();
    }
    setIsPageInputMode(false);
    setPageInputValue('');
  };

  const handlePageNumberClick = () => {
    setIsPageInputMode(true);
    setPageInputValue(currentPage.toString());
  };

  if (!showDbViewer && selectedCategoryId && !selectedCategorySafe) {
    return (
      <div className="flex-1 h-full flex flex-col bg-discord-bg">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-discord-muted">카테고리 로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-discord-bg">
      {showDbViewer ? (
        <div className="flex-1 flex flex-col min-h-0">
          <DatabaseViewer />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="shrink-0 p-6 border-b border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-xl font-bold text-discord-text">
                  {selectedCategorySafe?.name || '카테고리를 선택해주세요'}
                </h1>
                {!!selectedCategorySafe?.memo?.trim() && (
                  <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-discord-muted hover:text-discord-text"
                          aria-label="카테고리 메모"
                        >
                          <Info size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        align="center"
                        className="relative max-w-sm whitespace-pre-wrap break-words bg-[#23272a] bg-opacity-95 px-3 py-2 text-xs text-white border border-gray-700 rounded shadow-2xl"
                      >
                        {selectedCategorySafe.memo}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex gap-3">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Button
                      onClick={() => {
                        setEditingRecord(null);
                        setIsRecordModalOpen(true);
                      }}
                      className="bg-discord-accent hover:bg-blue-600"
                    >
                      <Plus size={16} className="mr-2" />
                      새 항목 추가
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBulkAddModalOpen(true);
                      }}
                    >
                      항목 다중 추가
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExportRecords('csv');
                      }}
                    >
                      CSV 내보내기
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExportRecords('xlsx');
                      }}
                    >
                      Excel 내보내기
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleImportRecords('csv');
                      }}
                    >
                      CSV 가져오기
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleImportRecords('xlsx');
                      }}
                    >
                      Excel 가져오기
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>

            {/* Search */}
            <div className="flex gap-3">
              <div className="flex flex-1 gap-2">
                <div className="relative flex-1">
                  {(effectiveSearchField === 'all' || !selectedSearchField || ['text', 'longtext', 'file'].includes(selectedSearchField.type)) && (
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted pointer-events-none" />
                  )}
                  {effectiveSearchField === 'all' || !selectedSearchField ? (
                    <Input
                      ref={searchInputRef}
                      placeholder="전체 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
                    />
                  ) : selectedSearchField.type === 'date' ? (
                    <DatePicker
                      value={searchTerm}
                      onChange={setSearchTerm}
                      placeholder={`${selectedSearchField.name} 날짜 선택...`}
                      className="bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
                    />
                  ) : selectedSearchField.type === 'select' && isFieldMultiple(selectedSearchField) ? (
                    <Popover open={multiSelectSearchOpen} onOpenChange={setMultiSelectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={multiSelectSearchOpen}
                          className={cn(
                            "w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text hover:bg-discord-hover hover:text-discord-text",
                            multiSearchTerms.length === 0 && "text-discord-muted"
                          )}
                        >
                          <span className="truncate">
                            {multiSearchLabel || `${selectedSearchFieldLabel} 선택...`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                        <Command className="bg-discord-sidebar border-none">
                          <CommandInput
                            placeholder={`${selectedSearchFieldLabel} 검색...`}
                            className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">
                              항목을 찾을 수 없습니다.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setMultiSearchTerms([]);
                                }}
                                className="text-discord-text hover:bg-discord-hover"
                              >
                                <Check className={cn("mr-2 h-4 w-4", multiSearchTerms.length === 0 ? "opacity-100" : "opacity-0")} />
                                선택 해제
                              </CommandItem>
                              {getFieldOptions(selectedSearchField).map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => {
                                    toggleMultiSearchTerm(option);
                                  }}
                                  className="text-discord-text hover:bg-discord-hover"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      multiSearchTerms.includes(option) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {option}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : selectedSearchField.type === 'relation' && isFieldMultiple(selectedSearchField) ? (
                    <Popover open={multiSelectSearchOpen} onOpenChange={setMultiSelectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={multiSelectSearchOpen}
                          className={cn(
                            "w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text hover:bg-discord-hover hover:text-discord-text",
                            multiSearchTerms.length === 0 && "text-discord-muted"
                          )}
                        >
                          <span className="truncate">
                            {multiSearchLabel || `${selectedSearchField.name} 선택...`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                        <Command className="bg-discord-sidebar border-none">
                          <CommandInput
                            placeholder={`${selectedSearchField.name} 검색...`}
                            className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">
                              항목을 찾을 수 없습니다.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setMultiSearchTerms([]);
                                }}
                                className="text-discord-text hover:bg-discord-hover"
                              >
                                <Check className={cn("mr-2 h-4 w-4", multiSearchTerms.length === 0 ? "opacity-100" : "opacity-0")} />
                                선택 해제
                              </CommandItem>
                              {relationSearchOptions.map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => {
                                    toggleMultiSearchTerm(option);
                                  }}
                                  className="text-discord-text hover:bg-discord-hover"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      multiSearchTerms.includes(option) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {option}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : selectedSearchField.type === 'relation' ? (
                    <Popover open={multiSelectSearchOpen} onOpenChange={setMultiSelectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={multiSelectSearchOpen}
                          className={cn(
                            "w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text hover:bg-discord-hover hover:text-discord-text",
                            !searchTerm && "text-discord-muted"
                          )}
                        >
                          <span className="truncate">
                            {searchTerm || `${selectedSearchFieldLabel} 선택...`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                        <Command className="bg-discord-sidebar border-none">
                          <CommandInput
                            placeholder={`${selectedSearchFieldLabel} 검색...`}
                            className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">
                              항목을 찾을 수 없습니다.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setSearchTerm('');
                                  setMultiSelectSearchOpen(false);
                                }}
                                className="text-discord-text hover:bg-discord-hover"
                              >
                                <Check className={cn("mr-2 h-4 w-4", !searchTerm ? "opacity-100" : "opacity-0")} />
                                선택 해제
                              </CommandItem>
                              {relationSearchOptions.map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => {
                                    setSearchTerm(option);
                                    setMultiSelectSearchOpen(false);
                                  }}
                                  className="text-discord-text hover:bg-discord-hover"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      searchTerm === option ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {option}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : selectedSearchField.type === 'select' ? (
                    <Select value={searchTerm} onValueChange={setSearchTerm}>
                      <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
                        <SelectValue placeholder={`${selectedSearchFieldLabel} 선택...`} />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-sidebar border-gray-600">
                        {getFieldOptions(selectedSearchField).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : selectedSearchField.type === 'checkbox' ? (
                    <Select value={searchTerm} onValueChange={setSearchTerm}>
                      <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
                        <SelectValue placeholder={`${selectedSearchField.name} 상태 선택...`} />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-sidebar border-gray-600">
                        <SelectItem value="true">체크됨</SelectItem>
                        <SelectItem value="false">체크 안 됨</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      ref={searchInputRef}
                      type={selectedSearchField.type === 'number' || selectedSearchField.type === 'percentage' ? 'number' : 'text'}
                      placeholder={`${selectedSearchFieldLabel} 검색...`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`${selectedSearchField.type === 'number' || selectedSearchField.type === 'percentage' ? 'pr-4' : 'pl-10'} bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500`}
                    />
                  )}
                </div>
                {(isMultiValueSearchField ? multiSearchTerms.length > 0 : Boolean(searchTerm)) && (
                  <button
                    onClick={() => {
                      if (isMultiValueSearchField) {
                        setMultiSearchTerms([]);
                      } else {
                        setSearchTerm('');
                      }
                    }}
                    className="shrink-0 px-3 rounded-md border border-gray-600 bg-discord-sidebar text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors"
                    aria-label="검색어 지우기"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <Select
                value={effectiveSearchField}
                onValueChange={(value) => {
                  setSearchField(value);
                  setSearchTerm('');
                  setMultiSearchTerms([]);
                  setMultiSelectSearchOpen(false);
                }}
              >
                <SelectTrigger className="w-48 bg-discord-sidebar border-gray-600 text-discord-text">
                  <Filter size={16} className="mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value="all">전체 필드</SelectItem>
                  {visibleFields.map(field => (
                    <React.Fragment key={field.id}>
                      <SelectItem value={field.id}>
                        {isTranslationEnabledField(field) ? `${field.name} (원문)` : field.name}
                      </SelectItem>
                      {isTranslationEnabledField(field) && (
                        <SelectItem value={getTranslatedFieldId(field.id)}>
                          {field.name} (번역)
                        </SelectItem>
                      )}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
              {/* 파일 확장자 필터 - 파일 필드가 있는 경우에만 표시 */}
              {fileField && (
                <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                  <SelectTrigger className="w-40 bg-discord-sidebar border-gray-600 text-discord-text">
                    <FileText size={16} className="mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-discord-sidebar border-gray-600">
                    <SelectItem value="all">전체 파일</SelectItem>
                    <SelectItem value="image">이미지</SelectItem>
                    <SelectItem value="video">동영상</SelectItem>
                    <SelectItem value="archive">압축파일</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {supportsGalleryView && (
                <TooltipProvider>
                  <div className="flex h-10 items-center border border-gray-600 bg-discord-sidebar shadow-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setRecordListView('table')}
                          aria-label="테이블 뷰"
                          className={cn(
                            "flex h-full w-10 items-center justify-center border-r border-gray-600 transition-colors",
                            recordListView === 'table'
                              ? "bg-discord-accent text-white"
                              : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
                          )}
                        >
                          <TableProperties size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>테이블 뷰</TooltipContent>
                    </Tooltip>
                    <ContextMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ContextMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setRecordListView('gallery')}
                              aria-label="갤러리 뷰"
                              className={cn(
                                "flex h-full w-10 items-center justify-center transition-colors",
                                recordListView === 'gallery'
                                  ? "bg-discord-accent text-white"
                                  : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
                              )}
                            >
                              <LayoutGrid size={16} />
                            </button>
                          </ContextMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>갤러리 뷰</TooltipContent>
                      </Tooltip>
                      <ContextMenuContent className="min-w-[220px]">
                        <ContextMenuLabel>갤러리 표시 항목</ContextMenuLabel>
                        <ContextMenuSeparator />
                        {galleryTitleField && (
                          <ContextMenuCheckboxItem checked disabled>
                            {galleryTitleField.name} (제목)
                          </ContextMenuCheckboxItem>
                        )}
                        {gallerySelectableFields.map((field) => (
                          <ContextMenuCheckboxItem
                            key={field.id}
                            checked={galleryVisibleFieldIds.includes(field.id)}
                            onCheckedChange={(checked) => {
                              setGalleryVisibleFieldIds((prev) => (
                                checked === true
                                  ? (prev.includes(field.id) ? prev : [...prev, field.id])
                                  : prev.filter((fieldId) => fieldId !== field.id)
                              ));
                            }}
                          >
                            {field.name}
                          </ContextMenuCheckboxItem>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                </TooltipProvider>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {sortedRecords.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-discord-text mb-2">
                    {hasActiveSearch ? '검색 결과가 없습니다' : '등록된 항목이 없습니다'}
                  </h3>
                  <p className="text-discord-muted mb-4">
                    {hasActiveSearch ? '다른 검색어로 시도해보세요' : '첫 번째 항목을 추가해보세요'}
                  </p>
                  {!hasActiveSearch && (
                    <Button
                      onClick={() => {
                        setEditingRecord(null);
                        setIsRecordModalOpen(true);
                      }}
                      className="bg-discord-accent hover:bg-blue-600"
                    >
                      <Plus size={16} className="mr-2" />
                      항목 추가하기
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {showGalleryView ? (
                  <RecordGalleryView
                    tableContainerRef={tableContainerRef}
                    paginatedRecords={paginatedRecords}
                    galleryTitleField={galleryTitleField}
                    galleryDetailFields={galleryDetailFields}
                    fileField={fileField}
                    selectedRecordId={selectedRecordId}
                    selectedCategoryId={selectedCategorySafe?.id || ''}
                    categories={categoriesSafe}
                    getCategoryRecords={getCategoryRecords}
                    getRecordFieldValue={getRecordFieldValue}
                    getGalleryFieldText={getGalleryFieldText}
                    galleryCardMinWidth={galleryCardMinWidth}
                    galleryThumbnailHeight={galleryThumbnailHeight}
                    galleryZoom={galleryZoom}
                    galleryZoomFeedbackVisible={galleryZoomFeedbackVisible}
                    listThumbnailFit={listThumbnailFit}
                    videoHoverPreviewEnabled={videoHoverPreviewEnabled}
                    onWheel={handleGalleryWheel}
                    onSelectRecord={setSelectedRecordId}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleContextMenuDelete}
                    onViewRelatedRecord={handleViewRelatedRecord}
                    onThumbnailClick={(filePath, record) => {
                      setViewerFilePath(filePath);
                      setViewerFileType(null);
                      setViewerCategoryId(selectedCategorySafe?.id || '');
                      setViewerRecordId(record.id);
                      setViewerModalOpen(true);
                    }}
                  />
                ) : (
                  <RecordTableView
                    tableContainerRef={tableContainerRef}
                    tableRef={tableRef}
                    paginatedRecords={paginatedRecords}
                    visibleFields={visibleFields}
                    fileField={fileField}
                    hasIncomingReferences={hasIncomingReferences}
                    selectedRecordId={selectedRecordId}
                    selectedCategoryId={selectedCategorySafe?.id || ''}
                    categories={categoriesSafe}
                    getCategoryRecords={getCategoryRecords}
                    getRecordFieldValue={getRecordFieldValue}
                    getRecordReferenceCount={getRecordReferenceCount}
                    getColumnWidth={getColumnWidth}
                    isResizing={isResizing}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    listThumbnailFit={listThumbnailFit}
                    videoHoverPreviewEnabled={videoHoverPreviewEnabled}
                    onSort={handleSort}
                    onResizeStart={handleResizeStart}
                    onSelectRecord={setSelectedRecordId}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleContextMenuDelete}
                    onViewRelatedRecord={handleViewRelatedRecord}
                    onThumbnailClick={(filePath, record) => {
                      setViewerFilePath(filePath);
                      setViewerFileType(null);
                      setViewerCategoryId(selectedCategorySafe?.id || '');
                      setViewerRecordId(record.id);
                      setViewerModalOpen(true);
                    }}
                    onPreviewChange={setThumbnailPreview}
                    onInlinePercentageChange={updateInlinePercentageValue}
                  />
                )}

                {thumbnailPreview && (
                  <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
                    <div
                      className="rounded-xl border border-[#3b3f46] bg-[#111214]/95 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm overflow-hidden"
                      style={{ width: `${previewWidth}px` }}
                    >
                      <div className="flex items-center justify-between border-b border-[#2b2d31] bg-[#1e1f22]/95 px-4 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b5bac1]">
                          {thumbnailPreview.isVideo && videoHoverPreviewEnabled ? '동영상 미리보기' : '썸네일 미리보기'}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.22),_transparent_58%),linear-gradient(180deg,_#232428_0%,_#15171a_100%)] p-4"
                        style={{ height: `${previewHeight}px` }}
                      >
                        {thumbnailPreview.dataUrl ? (
                          <div className="relative h-full w-full">
                            <img
                              src={thumbnailPreview.dataUrl}
                              alt="썸네일 미리보기"
                              className={`h-full w-full rounded-lg border border-[#2b2d31] shadow-[0_12px_24px_rgba(0,0,0,0.35)] ${
                                thumbnailPreview.thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'
                              }`}
                            />
                            {thumbnailPreview.isVideo && videoHoverPreviewEnabled && (
                              <HoverVideoPreview
                                filePath={thumbnailPreview.filePath}
                                delayMs={0}
                                className={`absolute inset-0 h-full w-full rounded-lg border border-[#2b2d31] shadow-[0_12px_24px_rgba(0,0,0,0.35)] ${
                                  thumbnailPreview.thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'
                                }`}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="relative flex h-full w-full items-center justify-center rounded-lg border border-dashed border-[#3b3f46] bg-[#18191c] text-center">
                            <div className="flex flex-col items-center">
                              {thumbnailPreview.missingFile ? (
                                <HelpCircle size={40} className="text-[#dcddde]" />
                              ) : /\.(zip|7z)$/i.test(thumbnailPreview.filePath) ? (
                                <Archive size={40} className="text-[#f0b232]" />
                              ) : (
                                <ImageOff size={40} className="text-[#b9bbbe]" />
                              )}
                              <p className="mt-3 text-sm text-[#dcddde]">
                                {thumbnailPreview.missingFile
                                  ? '원본 파일을 찾을 수 없습니다'
                                  : /\.(zip|7z)$/i.test(thumbnailPreview.filePath)
                                    ? '압축파일 미리보기'
                                    : '썸네일을 불러오는 중입니다'}
                              </p>
                            </div>
                            {thumbnailPreview.isVideo && videoHoverPreviewEnabled && (
                              <HoverVideoPreview
                                filePath={thumbnailPreview.filePath}
                                delayMs={0}
                                className={`absolute inset-0 h-full w-full rounded-lg ${
                                  thumbnailPreview.thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'
                                }`}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Pagination */}
                <div className="shrink-0 px-6 py-4 border-t border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-discord-muted">
                      전체 {sortedRecords.length}개 중 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedRecords.length)}개 표시
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCurrentPage(currentPage - 1);
                          scrollTableToTop();
                        }}
                        disabled={currentPage === 1}
                        className="border-gray-600 hover:bg-discord-hover"
                      >
                        이전
                      </Button>
                      {isPageInputMode ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={pageInputValue}
                            onChange={(e) => setPageInputValue(e.target.value)}
                            onKeyDown={handlePageInputKeyDown}
                            onBlur={handlePageInputBlur}
                            className="w-16 h-8 text-sm text-center bg-discord-sidebar border-gray-600 text-discord-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            min={1}
                            max={totalPages}
                            autoFocus
                          />
                          <span className="text-sm text-discord-text">/ {Math.max(totalPages, 1)}</span>
                        </div>
                      ) : (
                        <button
                          onClick={handlePageNumberClick}
                          className="flex items-center px-3 text-sm text-discord-text hover:bg-discord-hover rounded cursor-pointer"
                        >
                          {currentPage} / {Math.max(totalPages, 1)}
                        </button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCurrentPage(currentPage + 1);
                          scrollTableToTop();
                        }}
                        disabled={currentPage >= totalPages}
                        className="border-gray-600 hover:bg-discord-hover"
                      >
                        다음
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modals */}
          {selectedCategorySafe && (
            <RecordModal
              isOpen={isRecordModalOpen}
              onClose={() => {
                setIsRecordModalOpen(false);
                setEditingRecord(null);
              }}
              category={selectedCategorySafe}
              record={editingRecord}
            />
          )}

          {((viewingCategory ? categoryById.get(viewingCategory) : null) || selectedCategorySafe) && (
            <ViewRecordModal
              isOpen={isViewModalOpen}
              onClose={() => {
                setIsViewModalOpen(false);
                window.setTimeout(() => {
                  setViewingRecord(null);
                  setViewingCategory('');
                }, 200);
              }}
              category={(viewingCategory ? categoryById.get(viewingCategory) : null) || selectedCategorySafe}
              record={viewingRecord}
              onViewRecord={handleViewRelatedRecord}
            />
          )}

          <ViewerModal
            isOpen={viewerModalOpen}
            onClose={() => {
              setViewerModalOpen(false);
              setViewerFilePath('');
              setViewerFileType(null);
              setViewerCategoryId('');
              setViewerRecordId('');
            }}
            filePath={viewerFilePath}
            fileType={viewerFileType}
            categoryId={viewerCategoryId}
            recordId={viewerRecordId}
          />

          {/* 커스텀 다이얼로그들 */}
          <ConfirmDialog
            isOpen={isConfirmDialogOpen}
            onClose={() => {
              setIsConfirmDialogOpen(false);
              setRecordToDelete(null);
            }}
            onConfirm={confirmDelete}
            title="레코드 삭제"
            message="이 항목을 삭제하시겠습니까?"
            confirmText="삭제"
            cancelText="취소"
            variant="danger"
          />

          <AlertDialog
            isOpen={isAlertDialogOpen}
            onClose={() => setIsAlertDialogOpen(false)}
            title={alertDialogProps.title}
            message={alertDialogProps.message}
            variant={alertDialogProps.variant}
          />

          {selectedCategorySafe && (
            <BulkAddModal
              isOpen={isBulkAddModalOpen}
              onClose={() => setIsBulkAddModalOpen(false)}
              category={selectedCategorySafe}
            />
          )}
        </div>
      )}
    </div>
  );
};
