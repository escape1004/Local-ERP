import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Index from '../pages/Index';
import Dashboard from '../pages/Dashboard';
import BrowserPage from '../pages/Browser';
import NotFound from '../pages/NotFound';
import { isStandaloneBrowserWindow } from '../lib/browserNavigation';

function BrowserRoute() {
  const standalone = isStandaloneBrowserWindow();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (standalone) return undefined;
    const url = searchParams.get('url') || '';
    void window.electronAPI.openBrowserWindow(url || undefined);
    navigate('/dashboard', { replace: true });
    return undefined;
  }, [navigate, searchParams, standalone]);

  if (!standalone) return null;
  return <BrowserPage />;
}

export function RouterContent() {
  const navigate = useNavigate();

  useEffect(() => {
    const currentPath = window.location.hash || '#/dashboard';

    window.history.pushState({ preventBack: true }, '', currentPath);
    window.history.pushState({ preventBack: true }, '', currentPath);

    const handlePopState = () => {
      const savedPath = window.location.hash || '#/dashboard';
      window.history.pushState({ preventBack: true }, '', savedPath);
      window.history.pushState({ preventBack: true }, '', savedPath);
      navigate(savedPath.replace('#', ''));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/browser" element={<BrowserRoute />} />
      <Route path="/category" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function StandaloneBrowserShell() {
  return (
    <TooltipProvider>
      <div className="h-screen w-screen flex flex-col bg-discord-bg font-noto">
        <div className="flex-1 min-h-0">
          <HashRouter>
            <Routes>
              <Route path="/browser" element={<BrowserPage />} />
              <Route path="*" element={<Navigate to="/browser" replace />} />
            </Routes>
          </HashRouter>
          <Toaster />
        </div>
      </div>
    </TooltipProvider>
  );
}
