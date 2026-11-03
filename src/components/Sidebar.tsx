import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Menu, ChevronLeft, LayoutDashboard, Globe, Settings, Check } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { Category, Profile } from '../types';
import { isSeparatorCategory } from '../lib/category';
import { Button } from './ui/button';
import { CategoryModal } from './CategoryModal';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from './ui/input';
import { useToast } from './ui/use-toast';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    categories, 
    selectedCategoryId, 
    selectCategory, 
    reorderCategories,
    setShowDbViewer,
    getCategoryRecords,
    loadRecords,
    showDbViewer,
    deleteCategory,
    loadCategories,
    addCategory,
    currentProfile,
    setCurrentProfile,
    resetForProfile,
  } = useERPStore();
  
  const { showLoading, hideLoading, setLoading: setGlobalLoading } = useLoadingStore();
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categoryOrderLocked, setCategoryOrderLocked] = useState(false);

  const getProfileSwatchStyle = (color?: string): React.CSSProperties => {
    if (color === 'rainbow') {
      return {
        backgroundImage: 'linear-gradient(135deg, #ff5f6d 0%, #ffc371 22%, #47cf73 44%, #3b82f6 68%, #a855f7 100%)',
      };
    }

    return {
      backgroundColor: color || '#5865F2',
    };
  };

  useEffect(() => {
    let cancelled = false;
    const applyLocked = (locked: boolean) => {
      if (!cancelled) setCategoryOrderLocked(Boolean(locked));
    };
    const loadLocked = () => {
      void window.electronAPI.getConfig()
        .then((config) => applyLocked(Boolean(config?.categoryOrderLocked)))
        .catch(() => {});
    };
    loadLocked();
    const onLockedChange = (event: Event) => {
      applyLocked(Boolean((event as CustomEvent).detail));
    };
    window.addEventListener('erp:category-order-locked', onLockedChange);
    window.addEventListener('focus', loadLocked);
    return () => {
      cancelled = true;
      window.removeEventListener('erp:category-order-locked', onLockedChange);
      window.removeEventListener('focus', loadLocked);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      try {
        const nextProfiles = await window.electronAPI.getProfiles();
        if (!cancelled) {
          setProfiles(nextProfiles);
        }
      } catch {
        if (!cancelled) {
          setProfiles([]);
        }
      }
    };

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [currentProfile?.id]);

  const handleProfileManage = async () => {
    await window.electronAPI.clearCurrentProfile();
    resetForProfile();
    setCurrentProfile(null);
    setShowDbViewer(false);
    selectCategory(null);
    navigate('/dashboard', { replace: true });
  };

  const handleQuickProfileSwitch = async (profile: Profile) => {
    const result = await window.electronAPI.selectProfile(profile.id);

    if (!result.success || !result.profile) {
      toast({ title: result.error || '프로필을 전환할 수 없습니다.', variant: 'destructive' });
      return;
    }

    resetForProfile();
    setCurrentProfile(result.profile);
    setShowDbViewer(false);
    selectCategory(null);
    navigate('/dashboard', { replace: true });
    await loadCategories();
  };

  const { rootCategories, subCategoriesByParentId } = useMemo(() => {
    const roots: Category[] = [];
    const children = new Map<string, Category[]>();

    categories.forEach((category) => {
      if (!category.parentId) {
        roots.push(category);
        return;
      }

      const siblings = children.get(category.parentId) ?? [];
      siblings.push(category);
      children.set(category.parentId, siblings);
    });

    roots.sort((a, b) => a.order - b.order);
    children.forEach((siblings) => siblings.sort((a, b) => a.order - b.order));
    return { rootCategories: roots, subCategoriesByParentId: children };
  }, [categories]);

  const getSubCategories = (parentId: string) => subCategoriesByParentId.get(parentId) ?? [];

  // Check if category should be expanded (selected or has selected subcategory)
  const shouldShowSubCategories = (categoryId: string) => {
    if (selectedCategoryId === categoryId) return true;
    const subCategories = getSubCategories(categoryId);
    return subCategories.some(sub => sub.id === selectedCategoryId);
  };

  const handleDragEnd = (result: any) => {
    if (categoryOrderLocked || !result.destination) return;
    const { source, destination } = result;
    if (source.droppableId !== 'root-categories' || destination.droppableId !== 'root-categories') return;

    const siblings = [...rootCategories];
    const [reorderedItem] = siblings.splice(source.index, 1);
    siblings.splice(destination.index, 0, reorderedItem);

    const reorderedCategories = categories.map(cat => {
      if (!cat.parentId) {
        const newIndex = siblings.findIndex(sibling => sibling.id === cat.id);
        return { ...cat, order: newIndex };
      }
      return cat;
    });

    reorderCategories(reorderedCategories);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleExportCategory = async (category: Category) => {
    try {
      const result = await window.electronAPI.exportCategory(category.id);
      if (!result.success && !result.error) return;
      if (!result.success) {
        throw new Error(result.error || '카테고리 추출에 실패했습니다.');
      }
      toast({ title: '카테고리 추출 완료', description: result.path || '' });
    } catch (error) {
      toast({ title: '카테고리 추출 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const handleImportCategories = async () => {
    try {
      const result = await window.electronAPI.importCategories();
      if (!result.success && !result.error) return;
      if (!result.success) {
        throw new Error(result.error || '카테고리 붙여넣기에 실패했습니다.');
      }
      await loadCategories();
      toast({
        title: '카테고리 붙여넣기 완료',
        description: result.importedCount ? `${result.importedCount}개 카테고리를 추가했습니다.` : undefined,
      });
    } catch (error) {
      toast({ title: '카테고리 붙여넣기 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const handleAddSeparator = async () => {
    const now = new Date().toISOString();
    const rootItems = categories.filter((cat) => !cat.parentId);
    const nextOrder = rootItems.reduce((max, cat) => Math.max(max, cat.order ?? 0), -1) + 1;

    try {
      await addCategory({
        name: '구분선',
        itemType: 'separator',
        fields: [],
        order: nextOrder,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      toast({ title: '구분선 추가 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const handleDeleteSeparator = async (separator: Category) => {
    try {
      if (selectedCategoryId === separator.id) {
        selectCategory(null);
        setShowDbViewer(false);
        navigate('/dashboard', { replace: true });
      }
      await deleteCategory(separator.id);
    } catch (error) {
      toast({ title: '구분선 삭제 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const openDeleteConfirm = (category: Category) => {
    setDeleteTarget(category);
    setDeleteInput('');
    setShowDeleteConfirm(true);
  };
  const getCategorySubtreeIds = (rootCategoryId: string): string[] => {
    const subtreeIds: string[] = [];
    const stack = [rootCategoryId];

    while (stack.length > 0) {
      const categoryId = stack.pop();
      if (!categoryId) continue;

      subtreeIds.push(categoryId);
      categories
        .filter((item) => item.parentId === categoryId)
        .forEach((item) => stack.push(item.id));
    }

    return subtreeIds;
  };

  const handleMoveCategoryToProfile = async (category: Category, targetProfile: Profile) => {
    const result = await window.electronAPI.moveCategoryToProfile(category.id, targetProfile.id);

    if (!result.success) {
      toast({
        title: result.error || '카테고리를 다른 프로필로 이동할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const movedCategoryIds = getCategorySubtreeIds(category.id);
    if (selectedCategoryId && movedCategoryIds.includes(selectedCategoryId)) {
      selectCategory(null);
      setShowDbViewer(false);
      navigate('/dashboard');
    }

    await loadCategories();
    toast({
      title: '카테고리 이동 완료',
      description: `"${category.name}" 카테고리를 "${targetProfile.name}" 프로필로 이동했습니다.`,
    });
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      showLoading('카테고리와 하위 썸네일을 정리하는 중...');
      const deletedCategoryIds = getCategorySubtreeIds(deleteTarget.id);
      const shouldLeaveCategoryView = !!selectedCategoryId && deletedCategoryIds.includes(selectedCategoryId);

      if (shouldLeaveCategoryView) {
        selectCategory(null);
        setShowDbViewer(false);
        navigate('/dashboard', { replace: true });
        window.location.hash = '#/dashboard';
      }

      const result = await deleteCategory(deleteTarget.id);

      if (shouldLeaveCategoryView) {
        selectCategory(null);
        setShowDbViewer(false);
        navigate('/dashboard', { replace: true });
        window.location.hash = '#/dashboard';
      }

      let message = '카테고리가 삭제되었습니다.';
      if (result.thumbnailCleanupCount > 0) {
        message += `\n${result.thumbnailCleanupCount}개의 썸네일 파일을 정리했습니다.`;
      }
      if (result.relationCleanupCount > 0) {
        message += `\n${result.relationCleanupCount}개의 관계형 참조를 정리했습니다.`;
      }

      toast({
        title: '카테고리 삭제 완료',
        description: message,
        duration: 5000,
      });

      setShowDeleteConfirm(false);
      setDeleteInput('');
      setDeleteTarget(null);
    } catch (error) {
      toast({ title: '카테고리 삭제 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      hideLoading();
      setIsDeleting(false);
    }
  };

  const renderSeparator = (category: Category, level = 0, dragHandleProps?: any) => (
    <div key={category.id}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center px-3 py-2 mb-1 rounded ${categoryOrderLocked ? 'cursor-default' : 'cursor-grab'}`}
            style={{ paddingLeft: `${12 + level * 12}px` }}
            onClick={(event) => event.preventDefault()}
            {...dragHandleProps}
          >
            <div className="h-px flex-1 bg-gray-600" />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="text-red-400 focus:text-red-300"
            onClick={() => void handleDeleteSeparator(category)}
          >
            구분선 삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );

  const renderCategory = (category: Category, level = 0) => {
    if (isSeparatorCategory(category)) {
      return renderSeparator(category, level);
    }

    const subCategories = getSubCategories(category.id);
    const isSelected = selectedCategoryId === category.id;
    const showSubCategories = shouldShowSubCategories(category.id);
    const movableProfiles = profiles.filter((profile) => profile.id !== currentProfile?.id);

    return (
      <div key={category.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
          className={`flex items-center py-2 px-3 mb-1 rounded cursor-pointer transition-colors group ${
            isSelected 
              ? 'bg-discord-accent text-white' 
              : 'hover:bg-discord-hover text-discord-text'
          }`}
          style={{ paddingLeft: `${12 + level * 12}px` }}
          onClick={async () => {
            // 이미 로드된 카테고리인지 확인
            const existingRecords = getCategoryRecords(category.id);
            const needsLoading = !existingRecords || existingRecords.length === 0;
            
            if (needsLoading) {
              // 즉시 로딩 표시 (500ms 지연 없이)
              setGlobalLoading(true, '카테고리 로딩 중...');
              showLoading('카테고리 로딩 중...', 15000, true);
            }
            
            selectCategory(category.id);
            setShowDbViewer(false);
            navigate('/category');
            
            // 로드되지 않은 경우 selectCategory가 완료될 때까지 대기 후 로딩 화면 닫기
            if (needsLoading) {
              // selectCategory는 내부에서 레코드를 로드하므로, 짧은 지연 후 로딩 화면 닫기
              // 또는 loadRecords를 호출하여 확실히 로드 완료 확인
              try {
                await loadRecords(category.id);
              } catch (error) {
                console.error('카테고리 로드 오류:', error);
              } finally {
                hideLoading();
              }
            }
          }}
        >
          {level > 0 && (
            <span className="mr-2 text-gray-400">└</span>
          )}
          
          <span className="flex-1 text-sm font-medium truncate">
            {category.name}
          </span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => handleEditCategory(category)}>
              카테고리 수정
            </ContextMenuItem>
            {level === 0 && movableProfiles.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>프로필 변경</ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-[200px]">
                  {movableProfiles.map((profile) => (
                    <ContextMenuItem
                      key={profile.id}
                      onClick={() => void handleMoveCategoryToProfile(category, profile)}
                    >
                      {profile.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            <ContextMenuItem onClick={() => handleExportCategory(category)}>
              카테고리 추출
            </ContextMenuItem>
            <ContextMenuItem
              className="text-red-400 focus:text-red-300"
              onClick={() => openDeleteConfirm(category)}
            >
              카테고리 삭제
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        
        <AnimatePresence>
          {showSubCategories && subCategories.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {subCategories.map(subCategory => renderCategory(subCategory, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderDraggableCategory = (category: Category, level = 0, dragHandleProps?: any) => {
    if (isSeparatorCategory(category)) {
      return renderSeparator(category, level, dragHandleProps);
    }

    const subCategories = getSubCategories(category.id);
    const isSelected = selectedCategoryId === category.id;
    const showSubCategories = shouldShowSubCategories(category.id);
    const movableProfiles = profiles.filter((profile) => profile.id !== currentProfile?.id);

    return (
      <div key={category.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
          className={`flex items-center py-2 px-3 mb-1 rounded cursor-pointer transition-colors group ${
            isSelected 
              ? 'bg-discord-accent text-white' 
              : 'hover:bg-discord-hover text-discord-text'
          }`}
          style={{ paddingLeft: `${12 + level * 12}px` }}
          onClick={async () => {
            // 이미 로드된 카테고리인지 확인
            const existingRecords = getCategoryRecords(category.id);
            const needsLoading = !existingRecords || existingRecords.length === 0;
            
            if (needsLoading) {
              // 즉시 로딩 표시 (500ms 지연 없이)
              setGlobalLoading(true, '카테고리 로딩 중...');
              showLoading('카테고리 로딩 중...', 15000, true);
            }
            
            selectCategory(category.id);
            setShowDbViewer(false);
            navigate('/category');
            
            // 로드되지 않은 경우 selectCategory가 완료될 때까지 대기 후 로딩 화면 닫기
            if (needsLoading) {
              // selectCategory는 내부에서 레코드를 로드하므로, 짧은 지연 후 로딩 화면 닫기
              // 또는 loadRecords를 호출하여 확실히 로드 완료 확인
              try {
                await loadRecords(category.id);
              } catch (error) {
                console.error('카테고리 로드 오류:', error);
              } finally {
                hideLoading();
              }
            }
          }}
          {...dragHandleProps}
        >
          {level > 0 && (
            <span className="mr-2 text-gray-400">└</span>
          )}
          
          <span className="flex-1 text-sm font-medium truncate">
            {category.name}
          </span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => handleEditCategory(category)}>
              카테고리 수정
            </ContextMenuItem>
            {level === 0 && movableProfiles.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>프로필 변경</ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-[200px]">
                  {movableProfiles.map((profile) => (
                    <ContextMenuItem
                      key={profile.id}
                      onClick={() => void handleMoveCategoryToProfile(category, profile)}
                    >
                      {profile.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            <ContextMenuItem onClick={() => handleExportCategory(category)}>
              카테고리 추출
            </ContextMenuItem>
            <ContextMenuItem
              className="text-red-400 focus:text-red-300"
              onClick={() => openDeleteConfirm(category)}
            >
              카테고리 삭제
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        
        <AnimatePresence>
          {showSubCategories && subCategories.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {subCategories.map(subCategory => renderCategory(subCategory, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-12 h-full flex flex-col bg-discord-sidebar">
        <div className="shrink-0 flex items-center justify-center h-16 border-b border-gray-800">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCollapsed(false)}
            className="h-8 w-8 p-0 hover:bg-discord-hover"
          >
            <Menu size={16} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 h-full flex flex-col bg-discord-sidebar">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-gray-800 flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="min-w-0 rounded px-2 py-1 -ml-2 text-left"
            >
              <div className="truncate text-lg font-bold text-discord-text">
                {currentProfile?.name || '프로필'}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-[220px] border-gray-700 bg-discord-sidebar text-discord-text"
          >
            <DropdownMenuItem
              onClick={() => void handleProfileManage()}
              className="cursor-pointer text-discord-text hover:bg-discord-hover focus:bg-discord-hover focus:text-discord-text"
            >
              <Settings className="mr-2 h-4 w-4" />
              프로필 관리
            </DropdownMenuItem>
            {profiles.map((profile) => (
              <DropdownMenuItem
                key={profile.id}
                onClick={() => {
                  if (currentProfile?.id === profile.id) return;
                  void handleQuickProfileSwitch(profile);
                }}
                className={`flex items-center gap-3 text-discord-text hover:bg-discord-hover focus:bg-discord-hover focus:text-discord-text ${
                  currentProfile?.id === profile.id ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
                  style={getProfileSwatchStyle(profile.avatarColor)}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{profile.name}</span>
                {currentProfile?.id === profile.id && (
                  <Check className="h-4 w-4 shrink-0 text-discord-text" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsCollapsed(true)}
          className="h-8 w-8 p-0 hover:bg-discord-hover"
        >
          <ChevronLeft size={16} />
        </Button>
      </div>

      {/* Dashboard Menu */}
      <div className="shrink-0 p-3 border-b border-gray-800">
        <button
          onClick={() => {
            navigate('/dashboard');
            setShowDbViewer(false);
            selectCategory(null);
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors ${
            (location.pathname === '/dashboard' || location.hash === '#/dashboard' || (location.pathname === '/' && location.hash === '')) && !showDbViewer
              ? 'bg-discord-accent text-white'
              : 'hover:bg-discord-hover text-discord-text'
          }`}
        >
          <LayoutDashboard size={18} />
          <span className="text-sm font-medium">대시보드</span>
        </button>
        <button
          onClick={() => {
            void window.electronAPI.openBrowserWindow();
          }}
          className="mt-1 w-full flex items-center gap-3 px-3 py-2 rounded transition-colors hover:bg-discord-hover text-discord-text"
        >
          <Globe size={18} />
          <span className="text-sm font-medium">브라우저</span>
        </button>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto discord-scrollbar">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-discord-muted uppercase tracking-wide">
              카테고리
            </h2>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingCategory(null);
                    setIsModalOpen(true);
                  }}
                  className="h-6 w-6 p-0 hover:bg-discord-hover"
                >
                  <Plus size={14} />
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={handleImportCategories}>
                  카테고리 붙여넣기
                </ContextMenuItem>
                <ContextMenuItem onClick={() => void handleAddSeparator()}>
                  구분선 추가
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="root-categories" isDropDisabled={categoryOrderLocked}>
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {rootCategories.map((category, index) => (
                    <Draggable
                      key={category.id}
                      draggableId={category.id}
                      index={index}
                      isDragDisabled={categoryOrderLocked}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                        >
                          {renderDraggableCategory(
                            category,
                            0,
                            categoryOrderLocked ? undefined : provided.dragHandleProps,
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-discord-bg rounded-xl p-6 w-full max-w-md border border-gray-700 flex flex-col items-center overflow-hidden">
            <div className="mb-6 text-center text-discord-text">
              <div className="text-base font-medium mb-2">
                정말로 이 카테고리를 삭제하시겠습니까?
              </div>
              <div className="text-red-400 font-semibold mb-2">
                이 작업은 되돌릴 수 없습니다.
              </div>
              <div className="text-discord-muted text-sm">
                아래에 <span className="font-semibold">카테고리를 삭제하겠습니다</span>를 입력하세요.
              </div>
            </div>

            {isDeleting && (
              <div className="mb-4 p-4 bg-discord-sidebar rounded-lg border border-gray-600">
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-discord-accent"></div>
                  <div className="text-discord-text text-sm">
                    카테고리 삭제 중...
                    <div className="text-discord-muted text-xs mt-1">
                      썸네일 및 관계형 데이터 정리 중
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full mb-3 bg-discord-sidebar border-gray-600 text-discord-text"
              placeholder="카테고리를 삭제하겠습니다"
              disabled={isDeleting}
            />
            <div className="flex w-full gap-2">
              <Button
                variant="ghost"
                className="flex-1 text-discord-text hover:bg-discord-hover"
                onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteTarget(null); }}
                disabled={isDeleting}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                className="flex-1 bg-discord-danger hover:bg-red-900 text-white disabled:bg-red-800 disabled:text-red-300 disabled:cursor-not-allowed"
                disabled={deleteInput !== '카테고리를 삭제하겠습니다' || isDeleting}
                onClick={handleDeleteCategory}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          window.setTimeout(() => {
            setEditingCategory(null);
          }, 200);
        }}
        category={editingCategory}
      />
    </div>
  );
};
