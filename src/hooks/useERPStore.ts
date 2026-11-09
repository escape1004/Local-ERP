import { create } from 'zustand';
import { Category, DataRecord, DeleteCategoryResult, NewCategory, NewRecord, Profile } from '@/types';

interface ERPStore {
  categories: Category[];
  records: Record<string, DataRecord[]>;
  selectedCategoryId: string | null;
  pendingRecordFocus: { categoryId: string; recordId: string } | null;
  searchTerm: string;
  currentPage: number;
  itemsPerPage: number;
  showDbViewer: boolean;
  currentProfile: Profile | null;
  isProfileReady: boolean;

  loadCategories: () => Promise<void>;
  loadRecords: (categoryId: string, options?: { force?: boolean }) => Promise<void>;
  addCategory: (category: NewCategory) => Promise<string>;
  updateCategory: (id: string, updates: any) => Promise<void>;
  deleteCategory: (id: string) => Promise<DeleteCategoryResult>;
  reorderCategories: (categories: Category[]) => Promise<void>;
  addRecord: (record: NewRecord) => Promise<string>;
  updateRecord: (id: string, data: Record<string, any>, relatedRecordIds?: string[]) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  selectCategory: (id: string | null) => void;
  setSearchTerm: (term: string) => void;
  setCurrentPage: (page: number) => void;
  getCategoryRecords: (categoryId: string) => DataRecord[];
  setShowDbViewer: (show: boolean) => void;
  setPendingRecordFocus: (target: { categoryId: string; recordId: string } | null) => void;
  clearPendingRecordFocus: () => void;
  getRecordReferenceCount: (recordId: string, categoryId: string) => number;
  toggleDbViewer: () => void;
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => Promise<boolean>;
  invalidateCache: (categoryId?: string) => void;
  setCurrentProfile: (profile: Profile | null) => void;
  resetForProfile: () => void;
  markProfileReady: () => void;
}

export const useERPStore = create<ERPStore>((set, get) => ({
  categories: [],
  records: {},
  selectedCategoryId: null,
  pendingRecordFocus: null,
  searchTerm: '',
  currentPage: 1,
  itemsPerPage: 20,
  showDbViewer: false,
  currentProfile: null,
  isProfileReady: false,

  loadCategories: async () => {
    if (!get().currentProfile) {
      set({ categories: [] });
      return;
    }

    const categories = await window.electronAPI.getCategories();
    set({ categories });
  },

  loadRecords: async (categoryId: string, options?: { force?: boolean }) => {
    try {
      const profileId = get().currentProfile?.id;
      if (!profileId) {
        set(state => ({
          records: {
            ...state.records,
            [categoryId]: []
          }
        }));
        return;
      }

      // 로컬 스토리지에서 캐시된 데이터 확인
      const cacheKey = `records_${profileId}_${categoryId}`;
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
      
      // 캐시가 5분 이내인지 확인 (5분 = 300000ms)
      const isCacheValid = !options?.force
        && cacheTimestamp
        && (Date.now() - parseInt(cacheTimestamp)) < 300000;
      
      if (cachedData && isCacheValid) {
        try {
          const records = JSON.parse(cachedData);
          set(state => ({
            records: {
              ...state.records,
              [categoryId]: records
            }
          }));
          return; // 캐시된 데이터 사용
        } catch (error) {
          console.warn('캐시된 데이터 파싱 실패:', error);
        }
      }
      
      // 캐시가 없거나 만료된 경우 서버에서 로드
      const records = await window.electronAPI.getRecords(categoryId);
      
      // 로컬 스토리지에 캐시 저장
      try {
        localStorage.setItem(cacheKey, JSON.stringify(records));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      } catch (error) {
        console.warn('캐시 저장 실패:', error);
      }
      
      set(state => ({
        records: {
          ...state.records,
          [categoryId]: records
        }
      }));
    } catch (error) {
      set(state => ({
        records: {
          ...state.records,
          [categoryId]: []
        }
      }));
    }
  },

  // 캐시 무효화 함수
  invalidateCache: (categoryId?: string) => {
    const profileId = get().currentProfile?.id;
    if (categoryId) {
      // 특정 카테고리 캐시만 무효화
      if (!profileId) return;
      localStorage.removeItem(`records_${profileId}_${categoryId}`);
      localStorage.removeItem(`records_${profileId}_${categoryId}_timestamp`);
    } else {
      // 모든 캐시 무효화
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (!profileId) {
          if (key.startsWith('records_')) {
            localStorage.removeItem(key);
          }
          return;
        }

        if (key.startsWith(`records_${profileId}_`)) {
          localStorage.removeItem(key);
        }
      });
    }
  },

  addCategory: async (categoryData: NewCategory) => {
    const id = await window.electronAPI.addCategory(categoryData);
    await get().loadCategories();
    return id;
  },

  updateCategory: async (id, updates) => {
    await window.electronAPI.updateCategory(id, {
      ...updates,
      order_num: updates.order_num ?? updates.order,
    });
    await get().loadCategories();
  },

  deleteCategory: async (id) => {
    const categoryIdsToDelete = new Set<string>();
    const stack = [id];
    const categories = get().categories;

    while (stack.length > 0) {
      const categoryId = stack.pop();
      if (!categoryId || categoryIdsToDelete.has(categoryId)) continue;

      categoryIdsToDelete.add(categoryId);
      categories
        .filter(category => category.parentId === categoryId)
        .forEach(category => stack.push(category.id));
    }

    const result = await window.electronAPI.deleteCategory(id);
    set(state => {
      const remainingRecords = { ...state.records };
      categoryIdsToDelete.forEach(categoryId => {
        delete remainingRecords[categoryId];
      });

      return {
        selectedCategoryId: state.selectedCategoryId && categoryIdsToDelete.has(state.selectedCategoryId)
          ? null
          : state.selectedCategoryId,
        records: remainingRecords
      };
    });
    categoryIdsToDelete.forEach(categoryId => get().invalidateCache(categoryId));
    await get().loadCategories();
    return {
      success: result.success === true,
      thumbnailCleanupCount: Number(result.thumbnailCleanupCount) || 0,
      relationCleanupCount: Number(result.relationCleanupCount) || 0,
    };
  },

  reorderCategories: async (categories) => {
    set({ categories });
    
    for (const category of categories) {
      await window.electronAPI.updateCategory(category.id, {
        name: category.name,
        parentId: category.parentId,
        fields: category.fields,
        itemType: category.itemType,
        memo: category.memo,
        order_num: category.order
      });
    }

    await get().loadCategories();
  },

  addRecord: async (recordData: NewRecord) => {
    const id = recordData.id || Math.random().toString(36).substring(2);
    const record = {
      ...recordData,
      id
    };
    await window.electronAPI.addRecord(record);
    
    // 캐시 무효화 후 새로 생성한 레코드의 카테고리로 loadRecords 호출
    try {
      get().invalidateCache(recordData.categoryId);
      await get().loadRecords(recordData.categoryId);
    } catch (error) {
      console.error('Failed to refresh records after addRecord:', error);
    }
    return id;
  },

  updateRecord: async (id, data, relatedRecordIds) => {
    await window.electronAPI.updateRecord(id, data, relatedRecordIds);
    if (get().selectedCategoryId) {
      // 캐시 무효화 후 새로 로드
      try {
        get().invalidateCache(get().selectedCategoryId);
        await get().loadRecords(get().selectedCategoryId);
      } catch (error) {
        console.error('Failed to refresh records after updateRecord:', error);
      }
    }
  },

  deleteRecord: async (id) => {
    await window.electronAPI.deleteRecord(id);
    if (get().selectedCategoryId) {
      // 캐시 무효화 후 새로 로드
      get().invalidateCache(get().selectedCategoryId);
      await get().loadRecords(get().selectedCategoryId);
    }
  },

  selectCategory: async (id) => {
    if (id === null) {
      set({ selectedCategoryId: null });
      return;
    }
    
    set({ selectedCategoryId: id });
    
    try {
      const records = await window.electronAPI.getRecords(id);
      set(state => ({
        records: {
          ...state.records,
          [id]: records
        }
      }));
    } catch (error) {
      set(state => ({
        records: {
          ...state.records,
          [id]: []
        }
      }));
    }
  },

  setSearchTerm: (term) => set({ searchTerm: term }),

  setCurrentPage: (page) => set({ currentPage: page }),

  getCategoryRecords: (categoryId) => {
    return get().records[categoryId] || [];
  },

  setShowDbViewer: (show) => set({ showDbViewer: show }),
  setPendingRecordFocus: (target) => set({ pendingRecordFocus: target }),
  clearPendingRecordFocus: () => set({ pendingRecordFocus: null }),

  getRecordReferenceCount: (recordId: string, categoryId: string) => {
    let count = 0;
    const { categories, records: allRecords } = get();
    
    categories.forEach(category => {
      const categoryRecords = allRecords[category.id] || [];
      categoryRecords.forEach(record => {
        category.fields.forEach(field => {
          if (field.type === 'relation' && field.relationCategoryId === categoryId) {
            if (!field.multiple && record.data[field.id] === recordId) {
              count++;
            }
            if (field.multiple && Array.isArray(record.data[field.id])) {
              count += record.data[field.id].filter((id: string) => id === recordId).length;
            }
          }
        });
      });
    });
    return count;
  },

  toggleDbViewer: () => {
    set(state => ({ showDbViewer: !state.showDbViewer }));
  },

  checkDuplicate: async (categoryId: string, fieldId: string, value: any, recordId?: string) => {
    try {
      const category = get().categories.find(c => c.id === categoryId);
      if (!category) return false;

      const field = category.fields.find(f => f.id === fieldId);
      if (!field || !field.unique) return false;

      if (value === undefined || value === null || value === '') return false;

      const records = get().getCategoryRecords(categoryId);

      const duplicate = records.some(record => {
        if (recordId && record.id === recordId) return false;
        return record.data[fieldId] === value;
      });

      return duplicate;
    } catch (error) {
      return false;
    }
  },

  setCurrentProfile: (profile) => set({ currentProfile: profile }),

  resetForProfile: () => {
    set({
      categories: [],
      records: {},
      selectedCategoryId: null,
      searchTerm: '',
      currentPage: 1,
      showDbViewer: false,
      isProfileReady: false,
    });
  },

  markProfileReady: () => set({ isProfileReady: true }),
}));
