import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Download, Edit, Eye, Filter, Plus, Search, Trash2, X } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Category, DataRecord } from '../types';
import { LinkIcon } from 'lucide-react';
import { ConfirmDialog } from './ui/confirm-dialog';
import { AlertDialog } from './ui/alert-dialog';
import { format } from 'date-fns';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { BulkAddModal } from './BulkAddModal';
import { getRelationDisplayLabel } from '../utils/relationDisplay';

interface CategoryContentProps {
  categoryId: string | null;
}

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmpty);
  if (typeof value === 'object') return Object.keys(value).length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
};

export const CategoryContent: React.FC<CategoryContentProps> = ({ categoryId }) => {
  const {
    categories,
    records,
    currentPage,
    itemsPerPage,
    setCurrentPage,
    selectCategory,
    loadRecords,
    invalidateCache,
  } = useERPStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [viewingCategory, setViewingCategory] = useState<string>('');
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
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollTableToTop = useCallback(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    scrollTableToTop();
  }, [categoryId, setCurrentPage, scrollTableToTop]);

  const getRecordReferenceCount = useCallback((recordId: string, categoryId: string): number => {
    let count = 0;
    
    // 모든 카테고리를 순회
    categories.forEach(category => {
      // 현재 카테고리의 relation 타입 필드 중 targetCategoryId가 일치하는 것만 확인
      const relationFields = category.fields.filter(
        field => field.type === 'relation' && field.relationCategoryId === categoryId
      );
      
      if (relationFields.length > 0) {
        // 해당 카테고리의 모든 레코드를 확인
        const categoryRecords = records[category.id] || [];
        categoryRecords.forEach(record => {
          relationFields.forEach(field => {
            const value = record.data[field.id];
            if (field.multiple && Array.isArray(value)) {
              // 다중 선택인 경우 배열에서 recordId가 포함된 횟수를 더함
              count += value.filter(id => id === recordId).length;
            } else if (value === recordId) {
              // 단일 선택인 경우 값이 일치하면 카운트 증가
              count += 1;
            }
          });
        });
      }
    });
    
    return count;
  }, [categories, records]);

  const selectedCategory = categoryId
    ? categories.find(c => c.id === categoryId)
    : undefined;

  const getParentPath = (category: Category): Category[] => {
    const path: Category[] = [];
    let current = categories.find(c => c.id === category.parentId);
    while (current) {
      path.unshift(current);
      current = categories.find(c => c.id === current.parentId);
    }
    return path;
  };

  const handleCategoryClick = (id: string) => {
    selectCategory(id);
  };

  const categoryRecords = useMemo(
    () => (categoryId ? records[categoryId] || [] : []),
    [categoryId, records],
  );

  const sortedRecords = useMemo(() => {
    if (!selectedCategory) return [];
    return [...categoryRecords]
    .filter(record => {
      if (!searchTerm) return true;
      
      // 빈 값 체크 함수
      const isEmptyValue = (val: any): boolean => {
        if (val === null || val === undefined) return true;
        if (typeof val === 'string' && val.trim() === '') return true;
        if (Array.isArray(val) && val.length === 0) return true;
        if (typeof val === 'object' && Object.keys(val).length === 0) return true;
        return false;
      };
      
      if (searchField === 'all') {
        return selectedCategory.fields.some(field => {
          const value = record.data[field.id];
          
          // 빈 값인 경우 검색어가 빈 값 관련 키워드인지 확인
          if (isEmptyValue(value)) {
            const emptyKeywords = ['빈', '없음', 'null', 'undefined', 'empty', ''];
            return emptyKeywords.some(keyword => 
              searchTerm.toLowerCase().includes(keyword.toLowerCase())
            );
          }
          
          // 관계형 필드인 경우 실제 데이터 값으로 검색
          if (field.type === 'relation') {
            if (field.multiple && Array.isArray(value)) {
              // 다중 선택 관계형 필드
              const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
              if (!relatedCategory) return false;
              
              const relatedRecords = records[field.relationCategoryId] || [];
              const displayField = field.displayFieldId
                ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
                : relatedCategory.fields[0];
              
              return value.some(recordId => {
                const relatedRecord = relatedRecords.find(r => r.id === recordId);
                if (!relatedRecord) return false;
                const displayValue = relatedRecord.data[displayField?.id];
                return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
              });
            } else {
              // 단일 선택 관계형 필드
              const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
              if (!relatedCategory) return false;
              
              const relatedRecords = records[field.relationCategoryId] || [];
              const displayField = field.displayFieldId
                ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
                : relatedCategory.fields[0];
              
              const relatedRecord = relatedRecords.find(r => r.id === value);
              if (!relatedRecord) return false;
              const displayValue = relatedRecord.data[displayField?.id];
              return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
            }
          }
          
          // 일반 필드는 기존 로직 유지
          return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        });
      } else {
        const field = selectedCategory.fields.find(f => f.id === searchField);
        if (!field) return false;
        
        const value = record.data[searchField];
        
        // 빈 값인 경우 검색어가 빈 값 관련 키워드인지 확인
        if (isEmptyValue(value)) {
          const emptyKeywords = ['빈', '없음', 'null', 'undefined', 'empty', ''];
          return emptyKeywords.some(keyword => 
            searchTerm.toLowerCase().includes(keyword.toLowerCase())
          );
        }
        
        // 관계형 필드인 경우 실제 데이터 값으로 검색
        if (field.type === 'relation') {
          if (field.multiple && Array.isArray(value)) {
            // 다중 선택 관계형 필드
            const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
            if (!relatedCategory) return false;
            
            const relatedRecords = records[field.relationCategoryId] || [];
            const displayField = field.displayFieldId
              ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
              : relatedCategory.fields[0];
            
            return value.some(recordId => {
              const relatedRecord = relatedRecords.find(r => r.id === recordId);
              if (!relatedRecord) return false;
              const displayValue = relatedRecord.data[displayField?.id];
              return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
            });
          } else {
            // 단일 선택 관계형 필드
            const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
            if (!relatedCategory) return false;
            
            const relatedRecords = records[field.relationCategoryId] || [];
            const displayField = field.displayFieldId
              ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
              : relatedCategory.fields[0];
            
            const relatedRecord = relatedRecords.find(r => r.id === value);
            if (!relatedRecord) return false;
            const displayValue = relatedRecord.data[displayField?.id];
            return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
          }
        }
        
        // 일반 필드는 기존 로직 유지
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      }
    })
    .sort((a, b) => {
      if (!sortField) return 0;

      if (sortField === '__refCount') {
        const countA = getRecordReferenceCount(a.id, selectedCategory.id);
        const countB = getRecordReferenceCount(b.id, selectedCategory.id);
        return sortDirection === 'asc' ? countA - countB : countB - countA;
      }

      const aValue = a.data[sortField];
      const bValue = b.data[sortField];
      const field = selectedCategory.fields.find(f => f.id === sortField);
      if (!field) return 0;

      // 관계형 필드인 경우 실제 데이터 값으로 정렬
      if (field.type === 'relation') {
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (relatedCategory) {
          const relatedRecords = records[field.relationCategoryId] || [];
          const displayField = field.displayFieldId
            ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
            : relatedCategory.fields[0];
          
          if (field.multiple && Array.isArray(aValue) && Array.isArray(bValue)) {
            // 다중 선택 관계형 필드 정렬
            const aDisplayValues = aValue
              .map((id: string) => {
                const rec = relatedRecords.find(r => r.id === id);
                return rec ? String(rec.data[displayField?.id] || '') : '';
              })
              .filter(Boolean)
              .sort();
            const bDisplayValues = bValue
              .map((id: string) => {
                const rec = relatedRecords.find(r => r.id === id);
                return rec ? String(rec.data[displayField?.id] || '') : '';
              })
              .filter(Boolean)
              .sort();
            
            const aKey = aDisplayValues.join(',');
            const bKey = bDisplayValues.join(',');
            const comparison = aKey.localeCompare(bKey);
            return sortDirection === 'asc' ? comparison : -comparison;
          } else if (field.multiple) {
            // 다중 선택 필드이지만 배열이 아닌 경우 (잘못된 데이터)
            return 0;
          } else {
            // 단일 선택 관계형 필드 정렬
            const aRelatedRecord = relatedRecords.find(r => r.id === aValue);
            const bRelatedRecord = relatedRecords.find(r => r.id === bValue);
            
            const aDisplayValue = aRelatedRecord ? String(aRelatedRecord.data[displayField?.id] || '') : '';
            const bDisplayValue = bRelatedRecord ? String(bRelatedRecord.data[displayField?.id] || '') : '';
            
            const comparison = aDisplayValue.localeCompare(bDisplayValue);
            return sortDirection === 'asc' ? comparison : -comparison;
          }
        }
      }

      // 빈 값 처리 (모든 필드 타입에 적용)
      const isEmptyValue = (val: any): boolean => {
        if (val === null || val === undefined) return true;
        if (typeof val === 'string' && val.trim() === '') return true;
        if (Array.isArray(val) && val.length === 0) return true;
        if (typeof val === 'object' && Object.keys(val).length === 0) return true;
        return false;
      };

      const aIsEmpty = isEmptyValue(aValue);
      const bIsEmpty = isEmptyValue(bValue);

      // 둘 다 빈 값인 경우
      if (aIsEmpty && bIsEmpty) return 0;
      // a만 빈 값인 경우
      if (aIsEmpty) return sortDirection === 'asc' ? 1 : -1;
      // b만 빈 값인 경우
      if (bIsEmpty) return sortDirection === 'asc' ? -1 : 1;

      let comparison = 0;
      if (field.type === 'number') {
        comparison = Number(aValue) - Number(bValue);
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [categoryRecords, searchTerm, searchField, sortField, sortDirection, selectedCategory, categories, records, getRecordReferenceCount]);

  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = useMemo(
    () => sortedRecords.slice(startIndex, startIndex + itemsPerPage),
    [sortedRecords, startIndex, itemsPerPage],
  );

  const handleEdit = useCallback((record: DataRecord) => {
    setEditingRecord(record);
    setIsRecordModalOpen(true);
  }, []);

  // 키보드 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      // 모달이 열려있으면 단축키 비활성화
      if (isRecordModalOpen || isViewModalOpen || isConfirmDialogOpen || isAlertDialogOpen) {
        return;
      }

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (categoryId) {
          setEditingRecord(null);
          setIsRecordModalOpen(true);
        }
      } else if (e.key === 'F2' && selectedRecordId) {
        e.preventDefault();
        const selectedRecord = paginatedRecords.find(record => record.id === selectedRecordId)
          || sortedRecords.find(record => record.id === selectedRecordId);
        if (selectedRecord) {
          handleEdit(selectedRecord);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (paginatedRecords.length === 0) {
          return;
        }

        e.preventDefault();
        const currentIndex = paginatedRecords.findIndex(record => record.id === selectedRecordId);

        if (e.key === 'ArrowUp') {
          const nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
          setSelectedRecordId(paginatedRecords[nextIndex].id);
        } else {
          const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, paginatedRecords.length - 1);
          setSelectedRecordId(paginatedRecords[nextIndex].id);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [categoryId, selectedRecordId, paginatedRecords, sortedRecords, isRecordModalOpen, isViewModalOpen, isConfirmDialogOpen, isAlertDialogOpen, handleEdit]);

  useEffect(() => {
    if (!selectedRecordId || !selectedCategory) return;
    const exists = sortedRecords.some(record => record.id === selectedRecordId);
    if (!exists) {
      setSelectedRecordId(null);
    }
  }, [selectedRecordId, sortedRecords, selectedCategory]);

  // Ctrl+마우스 휠 페이지 이동 핸들러
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // 모달이 열려있으면 단축키 비활성화
      if (isRecordModalOpen || isViewModalOpen || isConfirmDialogOpen || isAlertDialogOpen) {
        return;
      }

      if (e.ctrlKey && categoryId) {
        e.preventDefault();
        if (e.deltaY > 0) {
          // 아래로 스크롤 (다음 페이지)
          if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
            scrollTableToTop();
          }
        } else if (e.deltaY < 0) {
          // 위로 스크롤 (이전 페이지)
          if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            scrollTableToTop();
          }
        }
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, [categoryId, currentPage, totalPages, isRecordModalOpen, isViewModalOpen, isConfirmDialogOpen, isAlertDialogOpen, setCurrentPage, scrollTableToTop]);

  if (!categoryId) {
    return (
      <div className="flex items-center justify-center h-full text-discord-muted">
        카테고리를 선택해주세요
      </div>
    );
  }

  if (!selectedCategory) {
    return (
      <div className="flex items-center justify-center h-full text-discord-muted">
        존재하지 않는 카테고리입니다
      </div>
    );
  }

  const handleSort = (fieldId: string) => {
    if (sortField === fieldId) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldId);
      setSortDirection('asc');
    }
  };

  const handleView = (record: DataRecord) => {
    setViewingRecord(record);
    setViewingCategory(categoryId);
    setIsViewModalOpen(true);
  };

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  const handleDelete = async (record: DataRecord) => {
    setRecordToDelete(record);
    setIsConfirmDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (recordToDelete) {
      try {
        await window.electronAPI.deleteRecord(recordToDelete.id);
        const updatedRecords = records[categoryId!].filter(r => r.id !== recordToDelete.id);
        if (updatedRecords.length === 0 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        }
      } catch (error) {
        console.error('Failed to delete record:', error);
        showAlert('오류', '레코드 삭제 중 오류가 발생했습니다.', 'error');
      }
      setRecordToDelete(null);
    }
  };

  const handleExportRecords = async (format: 'csv' | 'xlsx') => {
    try {
      const result = await window.electronAPI.exportCategoryRecords(selectedCategory.id, format);

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
        `${selectedCategory.name} 카테고리의 ${result.recordCount ?? 0}개 레코드를 ${formatLabel} 파일로 저장했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(`Failed to export ${format}:`, error);
      showAlert('내보내기 실패', '파일 내보내기 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleImportRecords = async (format: 'csv' | 'xlsx') => {
    try {
      const result = await window.electronAPI.importCategoryRecords(selectedCategory.id, format);

      if (!result.success) {
        if (!result.canceled) {
          showAlert('가져오기 실패', result.error || '파일 가져오기 중 오류가 발생했습니다.', 'error');
        }
        return;
      }

      invalidateCache(selectedCategory.id);
      await loadRecords(selectedCategory.id);

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
        (result.duplicateCount || result.skippedCount) ? 'warning' : 'success'
      );
    } catch (error) {
      console.error(`Failed to import ${format}:`, error);
      showAlert('가져오기 실패', '파일 가져오기 중 오류가 발생했습니다.', 'error');
    }
  };

  const exportToCSV = async () => {
    const headers = selectedCategory.fields.filter(f => !f.hidden).map(f => f.name).join(',');
    const rows = sortedRecords.map(record => 
      selectedCategory.fields.filter(f => !f.hidden).map(field => {
        const value = record.data[field.id];
        
        // 관계형 필드인 경우 실제 데이터 값으로 내보내기
        if (field.type === 'relation') {
          if (field.multiple && Array.isArray(value)) {
            // 다중 선택 관계형 필드
            const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
            if (!relatedCategory) return '';
            
            const relatedRecords = records[field.relationCategoryId] || [];
            const displayField = field.displayFieldId
              ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
              : relatedCategory.fields[0];
            
            const displayValues = value.map(recordId => {
              const relatedRecord = relatedRecords.find(r => r.id === recordId);
              return relatedRecord ? String(relatedRecord.data[displayField?.id] || '') : '';
            }).filter(Boolean);
            
            const result = displayValues.join(', ');
            return result.includes(',') ? `"${result}"` : result;
          } else {
            // 단일 선택 관계형 필드
            const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
            if (!relatedCategory) return '';
            
            const relatedRecords = records[field.relationCategoryId] || [];
            const displayField = field.displayFieldId
              ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
              : relatedCategory.fields[0];
            
            const relatedRecord = relatedRecords.find(r => r.id === value);
            if (!relatedRecord) return '';
            
            const displayValue = String(relatedRecord.data[displayField?.id] || '');
            return displayValue.includes(',') ? `"${displayValue}"` : displayValue;
          }
        }
        
        // 일반 필드는 기존 로직 유지
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedCategory.name || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatFieldValue = (field: any, value: any): string | JSX.Element => {
    // 빈 값 처리
    if (value === null || value === undefined || value === '' || value === '-') {
      return '-';
    }

    // 배열이지만 비어있는 경우
    if (Array.isArray(value) && value.length === 0) {
    return '-';
    }

    switch (field.type) {
      case 'number':
        return String(value);
      
      case 'text':
      case 'longtext':
        return String(value);
      
      case 'date': {
        const dateValue = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
          ? format(new Date(value), "yyyy-MM")
          : format(new Date(value), "yyyy-MM-dd");
        return dateValue;
      }
      
      case 'checkbox':
        return value ? '✓' : '✗';
      
      case 'select':
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return String(value);
      
      case 'relation': {
        if (!field.relationCategoryId) return String(value);
        
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return String(value);
        
        const relatedRecords = records[field.relationCategoryId] || [];
        if (Array.isArray(value)) {
          const names = value
            .map(id => {
              const record = relatedRecords.find(r => r.id === id);
              if (!record) return null;
              return getRelationDisplayLabel(
                record,
                field,
                categories,
                (categoryId) => records[categoryId] || []
              );
            })
            .filter(Boolean);
          
          return names.length > 0 ? names.join(', ') : '-';
        } else {
          const record = relatedRecords.find(r => r.id === value);
          if (!record) return '-';

          return getRelationDisplayLabel(
            record,
            field,
            categories,
            (categoryId) => records[categoryId] || []
          ) || '-';
        }
      }
      
      default:
        return String(value);
    }
  };

  const formatRelationArray = (values: any[], field: any): string => {
    if (!field.relationCategoryId || !values.length) return '-';
    
    const relatedRecords = records[field.relationCategoryId] || [];
    const relatedCategory = categories.find(c => c.id === field.relationCategoryId);
    if (!relatedCategory || !relatedCategory.fields[0]) return '-';
    
    const displayField = relatedCategory.fields[0];
    const names = values
      .map(id => {
        const record = relatedRecords.find(r => r.id === id);
        if (!record) return null;
        const displayValue = record.data[displayField.id];
        return displayValue || null;
      })
      .filter(Boolean);
    
    return names.length > 0 ? names.join(', ') : '-';
  };

  const formatRelation = (value: any, field: any): string => {
    if (!field.relationCategoryId || !value) return '-';
    
    const relatedRecords = records[field.relationCategoryId] || [];
    const relatedCategory = categories.find(c => c.id === field.relationCategoryId);
    if (!relatedCategory || !relatedCategory.fields[0]) return '-';
    
    const record = relatedRecords.find(r => r.id === value);
    if (!record) return '-';
    
    const displayField = relatedCategory.fields[0];
    const displayValue = record.data[displayField.id];
    return displayValue || '-';
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pageNumber = parseInt(pageInputValue);
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        setCurrentPage(pageNumber);
        setIsPageInputMode(false);
        setPageInputValue('');
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

  return (
    <div className="flex-1 flex flex-col bg-discord-bg">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-discord-text">
              {selectedCategory.name}
              {selectedCategory.parentId && (
                <span className="text-sm font-normal text-discord-muted ml-2">
                  (
                  {getParentPath(selectedCategory).map((cat, index, array) => (
                    <React.Fragment key={cat.id}>
                      <button
                        onClick={() => handleCategoryClick(cat.id)}
                        className="hover:text-discord-text hover:underline"
                      >
                        {cat.name}
                      </button>
                      {index < array.length - 1 && " > "}
                    </React.Fragment>
                  ))}
                  )
                </span>
              )}
            </h1>
            <p className="text-sm text-discord-muted mt-2">
              전체 {sortedRecords.length}개 레코드
              {searchTerm && ` (검색 결과: ${sortedRecords.length}개)`}
            </p>
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
                  새 레코드 추가
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBulkAddModalOpen(true);
                  }}
                >
                  레코드 다중 추가
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
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted" />
            <Input
              placeholder={searchField === 'all' ? '전체 검색...' : `${selectedCategory.fields.find(f => f.id === searchField)?.name || ''} 검색...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-discord-muted hover:text-discord-text"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <Select value={searchField} onValueChange={setSearchField}>
            <SelectTrigger className="w-48 bg-discord-sidebar border-gray-600 text-discord-text">
              <Filter size={16} className="mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600">
              <SelectItem value="all">전체 필드</SelectItem>
              {selectedCategory.fields.filter(f => !f.hidden).map(field => (
                <SelectItem key={field.id} value={field.id}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        {sortedRecords.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-discord-text mb-2">
                {searchTerm ? '검색 결과가 없습니다' : '등록된 레코드가 없습니다'}
              </h3>
              <p className="text-discord-muted mb-4">
                {searchTerm ? '다른 검색어로 시도해보세요' : '첫 번째 레코드를 추가해보세요'}
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => {
                    setEditingRecord(null);
                    setIsRecordModalOpen(true);
                  }}
                  className="bg-discord-accent hover:bg-blue-600"
                >
                  <Plus size={16} className="mr-2" />
                  레코드 추가하기
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Table */}
            <div className="flex-1 overflow-auto discord-scrollbar" ref={tableContainerRef}>
              <table className="w-full">
                <thead className="sticky top-0 bg-discord-sidebar border-b border-gray-700">
                  <tr>
                    {selectedCategory.fields.filter(f => !f.hidden).map(field => (
                      <th
                        key={field.id}
                        className="px-2 py-2 text-left text-sm font-semibold text-discord-text cursor-pointer hover:bg-discord-hover"
                        onClick={() => handleSort(field.id)}
                      >
                        <div className="flex items-center gap-2">
                          {field.name}
                          {sortField === field.id && (
                            <span className="text-discord-accent">
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                    {/* 참조되는 카테고리인 경우에만 참조 횟수 컬럼 표시 */}
                    {categories.some(cat => 
                      cat.fields.some(field => 
                        field.type === 'relation' && field.relationCategoryId === selectedCategory.id
                      )
                    ) && (
                      <th
                        className="px-2 py-2 text-left text-sm font-semibold text-discord-text cursor-pointer hover:bg-discord-hover"
                        onClick={() => handleSort('__refCount')}
                      >
                        <div className="flex items-center gap-2">
                          참조 횟수
                          {sortField === '__refCount' && (
                            <span className="text-discord-accent">
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    )}
                    <th className="px-2 py-2 text-left text-sm font-semibold text-discord-text w-32">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record) => (
                    <tr
                      key={record.id}
                      className={`border-b border-gray-800 transition-colors ${selectedRecordId === record.id ? 'bg-discord-hover' : 'hover:bg-discord-hover'}`}
                      onClick={() => setSelectedRecordId(record.id)}
                      onDoubleClick={() => {
                        setSelectedRecordId(record.id);
                        handleView(record);
                      }}
                    >
                      {selectedCategory.fields.filter(f => !f.hidden).map(field => {
                        const value = record.data[field.id];
                        return (
                          <td key={field.id} className="px-2 py-3 text-sm text-discord-text whitespace-nowrap">
                            {formatFieldValue(field, value)}
                          </td>
                        );
                      })}
                      {/* 참조되는 카테고리인 경우에만 참조 횟수 표시 */}
                      {categories.some(cat => 
                        cat.fields.some(field => 
                          field.type === 'relation' && field.relationCategoryId === selectedCategory.id
                        )
                      ) && (
                        <td className="px-2 py-3 text-sm whitespace-nowrap">
                          {(() => {
                            const count = getRecordReferenceCount(record.id, selectedCategory.id);
                            return count === 0 ? '0' : count;
                          })()}
                        </td>
                      )}
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedRecordId(record.id);
                              handleView(record);
                            }}
                            className="h-8 w-8 p-0 hover:bg-discord-bg"
                          >
                            <Eye size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedRecordId(record.id);
                              handleEdit(record);
                            }}
                            className="h-8 w-8 p-0 hover:bg-discord-bg"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedRecordId(record.id);
                              handleDelete(record);
                            }}
                            className="h-8 w-8 p-0 hover:bg-red-900 text-discord-danger"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
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
        )}
      </div>

      {/* Modals */}
      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setEditingRecord(null);
        }}
        category={selectedCategory}
        record={editingRecord}
      />

      <ViewRecordModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          window.setTimeout(() => {
            setViewingRecord(null);
            setViewingCategory('');
          }, 200);
        }}
        category={categories.find(cat => cat.id === viewingCategory) || selectedCategory}
        record={viewingRecord}
        onViewRecord={(nextRecord, nextCategory) => {
          setViewingRecord(nextRecord);
          setViewingCategory(nextCategory.id);
          setIsViewModalOpen(true);
        }}
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
        message="정말 삭제하시겠습니까?"
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

      <BulkAddModal
        isOpen={isBulkAddModalOpen}
        onClose={() => setIsBulkAddModalOpen(false)}
        category={selectedCategory}
      />
    </div>
  );
}; 
