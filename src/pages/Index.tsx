import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';
import { useERPStore } from '../hooks/useERPStore';
import { isSeparatorCategory } from '../lib/category';

type CategoryRouteState = {
  categoryId?: string;
  recordId?: string;
  openNewRecord?: boolean;
};

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    categories,
    loadCategories,
    currentProfile,
    selectedCategoryId,
    selectCategory,
    showDbViewer,
    pendingRecordFocus,
  } = useERPStore();

  const routeState = (typeof location.state === 'object' && location.state !== null
    ? location.state
    : null) as CategoryRouteState | null;
  const fallbackCategoryId = routeState?.categoryId || pendingRecordFocus?.categoryId || '';

  useEffect(() => {
    void loadCategories();
  }, [loadCategories, currentProfile?.id]);

  useEffect(() => {
    if (showDbViewer) return;

    if (!selectedCategoryId && fallbackCategoryId) {
      void selectCategory(fallbackCategoryId);
      return;
    }

    if (!selectedCategoryId) {
      navigate('/dashboard', { replace: true });
      return;
    }

    if (
      categories.length > 0
      && !categories.some((category) => category.id === selectedCategoryId && !isSeparatorCategory(category))
    ) {
      selectCategory(null);
      navigate('/dashboard', { replace: true });
    }
  }, [categories, navigate, selectedCategoryId, selectCategory, showDbViewer, fallbackCategoryId]);

  if (!showDbViewer && !selectedCategoryId && !fallbackCategoryId) {
    return <Navigate to="/dashboard" replace />;
  }

  if (
    !showDbViewer
    && selectedCategoryId
    && categories.length > 0
    && !categories.some((category) => category.id === selectedCategoryId && !isSeparatorCategory(category))
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <MainContent />
    </div>
  );
};

export default Index;
