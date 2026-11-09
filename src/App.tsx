import { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HashRouter } from 'react-router-dom';
import { X } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { LoadingOverlay } from './components/ui/loading-overlay';
import { AppSettingsModal } from './components/AppSettingsModal';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './components/ui/dialog';
import { useERPStore } from './hooks/useERPStore';
import { useLoadingStore } from './hooks/useLoadingStore';
import { AppUpdateModal } from './components/AppUpdateModal';
import { toast } from './components/ui/use-toast';
import { isStandaloneBrowserWindow } from './lib/browserNavigation';
import { isProfileHydrationPending, shouldHideAppUntilReady } from './lib/profileHydration';
import { hasFocusedMediaPlayback, nextIdleActivityAt, shouldIdleLock, silenceAppForLock } from './lib/appLock';
import {
  PROFILE_COLORS,
  RAINBOW_PROFILE_COLOR,
  formatPasswordLockRemainingLabel,
  getProfileSwatchStyle,
  isDefaultProfile,
  normalizeProfileColor,
} from './lib/profileAppearance';
import { RouterContent, StandaloneBrowserShell } from './components/AppRouter';
import { AppProfileSelect } from './components/AppProfileSelect';
import { AppPasswordGate } from './components/AppPasswordGate';
import type { AppUpdateState, Profile } from './types';

const INITIAL_UPDATE_STATE: AppUpdateState = {
  status: 'idle',
  currentVersion: '...',
  latestVersion: null,
  updateAvailable: false,
  progress: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  error: null,
};

const App = () => {
  const { currentProfile, isProfileReady, setCurrentProfile, resetForProfile, setShowDbViewer, selectCategory } = useERPStore();
  const { showLoading, hideLoading, setLoading } = useLoadingStore();
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isAppUpdateOpen, setIsAppUpdateOpen] = useState(false);
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>(INITIAL_UPDATE_STATE);
  const [isCheckingPassword, setIsCheckingPassword] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordLockUntil, setPasswordLockUntil] = useState<number | null>(null);
  const [passwordLockNow, setPasswordLockNow] = useState(Date.now());
  const [hasAppPassword, setHasAppPassword] = useState(false);
  const [idleLockMinutes, setIdleLockMinutes] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileError, setProfileError] = useState('');
  const [newProfileName, setNewProfileName] = useState('');
  const [selectedProfileColor, setSelectedProfileColor] = useState(PROFILE_COLORS[0]);
  const [customProfileColor, setCustomProfileColor] = useState(PROFILE_COLORS[0]);
  const [isProfileBusy, setIsProfileBusy] = useState(false);
  const [isCreateProfileOpen, setIsCreateProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [deleteTargetProfile, setDeleteTargetProfile] = useState<Profile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const lastActivityAtRef = useRef(Date.now());

  const selectedProfileInitial = useMemo(
    () => (newProfileName.trim().charAt(0) || 'P').toUpperCase(),
    [newProfileName]
  );
  const isCustomColorSelected = !PROFILE_COLORS.includes(selectedProfileColor);
  const isPasswordLocked = Boolean(passwordLockUntil && passwordLockUntil > passwordLockNow);
  const passwordLockRemainingSeconds = passwordLockUntil
    ? Math.max(0, Math.ceil((passwordLockUntil - passwordLockNow) / 1000))
    : 0;
  const passwordLockRemainingLabel = formatPasswordLockRemainingLabel(passwordLockRemainingSeconds);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.electronAPI.onAppUpdateState((state) => {
      if (active) setAppUpdateState(state);
    });

    void window.electronAPI.getAppUpdateState().then((state) => {
      if (active) setAppUpdateState(state);
      return window.electronAPI.checkForAppUpdates();
    }).then((state) => {
      if (active) setAppUpdateState(state);
    }).catch((error) => {
      if (!active) return;
      setAppUpdateState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : '업데이트 정보를 확인하지 못했습니다.',
      }));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    try {
      const state = await window.electronAPI.checkForAppUpdates();
      setAppUpdateState(state);

      if (state.updateAvailable && state.latestVersion) {
        toast({
          title: '새 버전을 사용할 수 있습니다.',
          description: `v${state.latestVersion} 업데이트를 설치할 수 있습니다.`,
        });
      } else if (state.status === 'not-available') {
        toast({
          title: '현재 최신 버전입니다.',
          description: `Local ERP v${state.currentVersion}`,
        });
      } else if (state.status === 'disabled') {
        toast({
          title: '업데이트 확인을 사용할 수 없습니다.',
          description: '자동 업데이트 확인은 설치된 앱에서 사용할 수 있습니다.',
        });
      } else if (state.status === 'error') {
        toast({
          title: '업데이트 확인 실패',
          description: state.error || '업데이트 정보를 확인하지 못했습니다.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '업데이트 확인 실패',
        description: error instanceof Error ? error.message : '업데이트 정보를 확인하지 못했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadUpdate = () => {
    void window.electronAPI.downloadAppUpdate().then(setAppUpdateState);
  };

  const handleInstallUpdate = () => {
    void window.electronAPI.installAppUpdate();
  };

  const keepPasswordInputFocus = () => {
    window.requestAnimationFrame(() => {
      passwordInputRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!passwordLockUntil) return;

    const updateLockClock = () => {
      const now = Date.now();
      setPasswordLockNow(now);
      if (passwordLockUntil <= now) {
        setPasswordLockUntil(null);
        setPasswordError('');
      }
    };

    updateLockClock();
    const intervalId = window.setInterval(updateLockClock, 1000);
    return () => window.clearInterval(intervalId);
  }, [passwordLockUntil]);

  useEffect(() => {
    const handleConfigUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ hasAppPassword?: boolean; idleLockMinutes?: number }>).detail;
      if (typeof detail?.hasAppPassword === 'boolean') {
        setHasAppPassword(detail.hasAppPassword);
      }
      if (typeof detail?.idleLockMinutes === 'number') {
        setIdleLockMinutes(detail.idleLockMinutes);
      }
    };

    window.addEventListener('config:updated', handleConfigUpdated);
    return () => window.removeEventListener('config:updated', handleConfigUpdated);
  }, []);

  useEffect(() => {
    if (
      isStandaloneBrowserWindow()
      || requiresPassword
      || !hasAppPassword
      || idleLockMinutes <= 0
      || isCheckingPassword
    ) {
      return;
    }

    lastActivityAtRef.current = Date.now();

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
    };
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { capture: true, passive: true });
    });

    const intervalId = window.setInterval(() => {
      void (async () => {
        let browserIdle = null;
        try {
          browserIdle = await window.electronAPI.getBrowserIdleState();
        } catch {
          // Ignore IPC failures while checking the browser window.
        }

        const now = Date.now();
        const next = nextIdleActivityAt(lastActivityAtRef.current, now, {
          hasFocusedMediaPlayback: hasFocusedMediaPlayback(),
          browser: browserIdle,
        });
        lastActivityAtRef.current = next.activityAt;
        if (next.keepAwake || !shouldIdleLock(next.activityAt, now, idleLockMinutes)) {
          return;
        }

        setIsAppSettingsOpen(false);
        setIsAppUpdateOpen(false);
        setIsCreateProfileOpen(false);
        setShowDeleteConfirm(false);
        setShowPassword(false);
        setPasswordInput('');
        setPasswordError('');
        setRequiresPassword(true);
        void silenceAppForLock();
        void window.electronAPI.closeBrowserWindow();
      })();
    }, 1000);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity, true);
      });
      window.clearInterval(intervalId);
    };
  }, [hasAppPassword, idleLockMinutes, isCheckingPassword, requiresPassword]);

  const refreshProfiles = async () => {
    const nextProfiles = await window.electronAPI.getProfiles();
    setProfiles(nextProfiles);
    return nextProfiles;
  };

  const handleOpenDatabaseViewer = () => {
    selectCategory(null);
    setShowDbViewer(true);
    setIsAppSettingsOpen(false);
    window.location.hash = '#/category';
  };

  useEffect(() => {
    if (isStandaloneBrowserWindow()) {
      setIsCheckingPassword(false);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [config, nextProfiles] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getProfiles(),
          window.electronAPI.clearCurrentProfile(),
        ]);

        if (cancelled) return;

        setRequiresPassword(Boolean(config?.hasAppPassword));
        setHasAppPassword(Boolean(config?.hasAppPassword));
        setIdleLockMinutes(typeof config?.idleLockMinutes === 'number' ? config.idleLockMinutes : 0);
        setPasswordLockUntil(typeof config?.passwordLockUntil === 'number' ? config.passwordLockUntil : null);
        setProfiles(nextProfiles as Profile[]);
        setCurrentProfile(null);
        resetForProfile();
      } catch {
        if (cancelled) return;
        setRequiresPassword(false);
        setHasAppPassword(false);
        setIdleLockMinutes(0);
        setPasswordLockUntil(null);
        setProfiles([]);
        setCurrentProfile(null);
        resetForProfile();
      } finally {
        if (!cancelled) {
          setIsCheckingPassword(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [resetForProfile, setCurrentProfile]);

  useEffect(() => {
    if (isProfileHydrationPending(currentProfile, isProfileReady)) {
      setLoading(true, '데이터를 불러오는 중...');
    }
  }, [currentProfile, isProfileReady, setLoading]);

  const handleUnlock = async () => {
    if (isPasswordLocked) return;

    const result = await window.electronAPI.verifyAppPassword(passwordInput);
    if (result.success) {
      setRequiresPassword(false);
      setPasswordInput('');
      setPasswordError('');
      setPasswordLockUntil(null);
      lastActivityAtRef.current = Date.now();
      return;
    }

    if (result.locked && typeof result.lockUntil === 'number') {
      setPasswordLockUntil(result.lockUntil);
      setPasswordInput('');
      setPasswordError('');
      return;
    }

    const remainingAttempts = typeof result.remainingAttempts === 'number'
      ? ` ${result.remainingAttempts}회 더 틀리면 로그인이 잠깁니다.`
      : '';
    setPasswordError(`비밀번호가 올바르지 않습니다.${remainingAttempts}`);
  };

  const handleSelectProfile = async (profile: Profile) => {
    setIsProfileBusy(true);
    setProfileError('');
    setLoading(true, '데이터를 불러오는 중...');

    try {
      if (!window.electronAPI?.selectProfile) {
        setProfileError('프로필 선택 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
        hideLoading();
        return;
      }

      const result = await window.electronAPI.selectProfile(profile.id);
      if (!result.success || !result.profile) {
        setProfileError(result.error || '프로필을 선택할 수 없습니다.');
        hideLoading();
        return;
      }

      window.location.hash = '#/dashboard';
      resetForProfile();
      setCurrentProfile(result.profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 선택 중 오류가 발생했습니다.');
      hideLoading();
    } finally {
      setIsProfileBusy(false);
    }
  };

  const handleCreateProfile = async () => {
    const name = newProfileName.trim();
    if (!name) {
      setProfileError('프로필 이름을 입력하세요.');
      return;
    }

    setIsProfileBusy(true);
    setProfileError('');

    try {
      if (!window.electronAPI?.createProfile) {
        setProfileError('프로필 생성 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
        return;
      }

      const result = await window.electronAPI.createProfile({
        name,
        avatarColor: normalizeProfileColor(selectedProfileColor),
      });

      if (!result.success || !result.profile) {
        setProfileError(result.error || '프로필을 만들 수 없습니다.');
        return;
      }

      const nextProfiles = await refreshProfiles();
      setNewProfileName('');
      setSelectedProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setCustomProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setIsCreateProfileOpen(false);
      await handleSelectProfile(result.profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 생성 중 오류가 발생했습니다.');
      hideLoading();
    } finally {
      setIsProfileBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    const name = newProfileName.trim();
    if (!name) {
      setProfileError('프로필 이름을 입력하세요.');
      return;
    }

    setIsProfileBusy(true);
    setProfileError('');

    try {
      const avatarColor = normalizeProfileColor(selectedProfileColor);

      if (editingProfile) {
        if (!window.electronAPI?.updateProfile) {
          setProfileError('프로필 수정 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
          return;
        }

        showLoading('프로필 썸네일 경로를 정리하는 중...');
        const result = await window.electronAPI.updateProfile(editingProfile.id, {
          name,
          avatarColor,
        });

        if (!result.success || !result.profile) {
          setProfileError(result.error || '프로필을 수정할 수 없습니다.');
          return;
        }

        await refreshProfiles();
        if (currentProfile?.id === editingProfile.id) {
          setCurrentProfile(result.profile);
        }
        setIsCreateProfileOpen(false);
        setEditingProfile(null);
        setNewProfileName('');
        setSelectedProfileColor(PROFILE_COLORS[0]);
        setCustomProfileColor(PROFILE_COLORS[0]);
        return;
      }

      if (!window.electronAPI?.createProfile) {
        setProfileError('프로필 생성 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
        return;
      }

      const result = await window.electronAPI.createProfile({
        name,
        avatarColor,
      });

      if (!result.success || !result.profile) {
        setProfileError(result.error || '프로필을 만들 수 없습니다.');
        return;
      }

      const nextProfiles = await refreshProfiles();
      setNewProfileName('');
      setSelectedProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setCustomProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setIsCreateProfileOpen(false);
      await handleSelectProfile(result.profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setIsProfileBusy(false);
      if (editingProfile) {
        hideLoading();
      }
    }
  };

  const openCreateProfileModal = () => {
    setEditingProfile(null);
    setProfileError('');
    setNewProfileName('');
    setSelectedProfileColor(PROFILE_COLORS[0]);
    setCustomProfileColor(PROFILE_COLORS[0]);
    setIsCreateProfileOpen(true);
  };

  const openEditProfileModal = (profile: Profile) => {
    const profileColor = normalizeProfileColor(profile.avatarColor || PROFILE_COLORS[0]);
    setEditingProfile(profile);
    setProfileError('');
    setNewProfileName(profile.name);
    setSelectedProfileColor(profileColor);
    setCustomProfileColor(profileColor);
    setIsCreateProfileOpen(true);
  };

  const handleDeleteProfile = async () => {
    if (!deleteTargetProfile) return;
    if (isDefaultProfile(deleteTargetProfile)) {
      setProfileError('기본 프로필은 삭제할 수 없습니다.');
      setShowDeleteConfirm(false);
      setDeleteInput('');
      setDeleteTargetProfile(null);
      return;
    }

    setIsProfileBusy(true);
    setProfileError('');

    try {
      showLoading('프로필과 하위 카테고리 썸네일을 정리하는 중...');
      const result = await window.electronAPI.deleteProfile(deleteTargetProfile.id);
      if (!result.success) {
        setProfileError(result.error || '프로필을 삭제할 수 없습니다.');
        return;
      }

      await refreshProfiles();
      if (editingProfile?.id === deleteTargetProfile.id) {
        setEditingProfile(null);
        setIsCreateProfileOpen(false);
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 삭제 중 오류가 발생했습니다.');
    } finally {
      hideLoading();
      setIsProfileBusy(false);
      setShowDeleteConfirm(false);
      setDeleteInput('');
      setDeleteTargetProfile(null);
    }
  };

  if (isStandaloneBrowserWindow()) {
    return <StandaloneBrowserShell />;
  }

  return (
    <TooltipProvider>
        <div className="h-screen w-screen flex flex-col bg-discord-bg font-noto">
          <TitleBar
            onOpenSettings={() => currentProfile && !requiresPassword && setIsAppSettingsOpen(true)}
            onOpenUpdate={() => setIsAppUpdateOpen(true)}
            updateAvailable={appUpdateState.updateAvailable}
            settingsDisabled={isCheckingPassword || requiresPassword || !currentProfile}
          />
          <div className="flex-1 min-h-0 relative">
            {isCheckingPassword ? null : (
              <>
                {currentProfile ? (
                  <div
                    className={`h-full ${shouldHideAppUntilReady(requiresPassword, isProfileReady) ? 'pointer-events-none invisible' : ''}`}
                    aria-hidden={shouldHideAppUntilReady(requiresPassword, isProfileReady)}
                  >
                    <HashRouter>
                      <RouterContent />
                    </HashRouter>
                    <Toaster />
                  </div>
                ) : requiresPassword ? null : (
                  <AppProfileSelect
                    profiles={profiles}
                    isProfileBusy={isProfileBusy}
                    profileError={profileError}
                    onSelect={(profile) => void handleSelectProfile(profile)}
                    onEdit={openEditProfileModal}
                    onDelete={(profile) => {
                      setDeleteTargetProfile(profile);
                      setDeleteInput('');
                      setProfileError('');
                      setShowDeleteConfirm(true);
                    }}
                    onCreate={openCreateProfileModal}
                  />
                )}
                {requiresPassword && (
                  <AppPasswordGate
                    currentProfile={currentProfile}
                    passwordInput={passwordInput}
                    showPassword={showPassword}
                    isPasswordLocked={isPasswordLocked}
                    passwordError={passwordError}
                    passwordLockRemainingLabel={passwordLockRemainingLabel}
                    passwordInputRef={passwordInputRef}
                    onPasswordChange={(value) => {
                      setPasswordInput(value);
                      setPasswordError('');
                    }}
                    onToggleShowPassword={() => setShowPassword((visible) => !visible)}
                    onUnlock={handleUnlock}
                    onKeepFocus={() => {
                      if (requiresPassword) keepPasswordInputFocus();
                    }}
                  />
                )}
              </>
            )}
          </div>
          <AppSettingsModal
            open={isAppSettingsOpen}
            onOpenChange={setIsAppSettingsOpen}
            onOpenDatabaseViewer={handleOpenDatabaseViewer}
            updateState={appUpdateState}
            onOpenUpdate={() => {
              setIsAppSettingsOpen(false);
              setIsAppUpdateOpen(true);
            }}
            onCheckForUpdates={handleCheckForUpdates}
          />
          <AppUpdateModal
            open={isAppUpdateOpen}
            onOpenChange={setIsAppUpdateOpen}
            updateState={appUpdateState}
            onCheck={handleCheckForUpdates}
            onDownload={handleDownloadUpdate}
            onInstall={handleInstallUpdate}
          />
          <Dialog
            open={isCreateProfileOpen}
            onOpenChange={(open) => {
              setIsCreateProfileOpen(open);
              if (!open) {
                setProfileError('');
                setEditingProfile(null);
              }
            }}
          >
            <DialogContent className="max-w-md p-0 gap-0 overflow-hidden bg-discord-bg border-gray-700 text-discord-text [&>button]:hidden">
              <DialogTitle className="sr-only">{editingProfile ? '프로필 수정' : '새 프로필 만들기'}</DialogTitle>
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-white">{editingProfile ? '프로필 수정' : '새 프로필 만들기'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateProfileOpen(false)}
                  className="text-discord-muted hover:text-discord-text"
                  aria-label="새 프로필 만들기 닫기"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4 bg-discord-bg">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-xl text-3xl font-semibold text-white"
                  style={getProfileSwatchStyle(selectedProfileColor)}
                >
                  {selectedProfileInitial}
                </div>
                <Input
                  value={newProfileName}
                  onChange={(e) => {
                    setNewProfileName(e.target.value);
                    setProfileError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleSaveProfile();
                    }
                  }}
                  className="bg-discord-sidebar border-gray-600 text-discord-text"
                  placeholder="프로필 이름"
                />
                <div className="flex flex-wrap gap-2">
                  {PROFILE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setSelectedProfileColor(color);
                        setCustomProfileColor(color);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 p-0 transition ${
                        selectedProfileColor === color ? 'border-white scale-105' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: 'transparent' }}
                      aria-label={`프로필 색상 ${color}`}
                    >
                      <span
                        className="block h-full w-full rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => customColorInputRef.current?.click()}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 p-0 transition ${
                      isCustomColorSelected ? 'border-white scale-105' : 'border-transparent'
                    }`}
                    aria-label="프로필 색상 무지개"
                  >
                    <span
                      className="block h-full w-full rounded-full"
                      style={getProfileSwatchStyle(RAINBOW_PROFILE_COLOR)}
                    />
                  </button>
                </div>
                <input
                  ref={customColorInputRef}
                  type="color"
                  value={normalizeProfileColor(customProfileColor)}
                  onChange={(e) => {
                    const nextColor = normalizeProfileColor(e.target.value);
                    setCustomProfileColor(nextColor);
                    setSelectedProfileColor(nextColor);
                  }}
                  className="sr-only"
                  aria-label="직접 색상 선택"
                />
                {profileError && <p className="text-sm text-red-400">{profileError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-discord-bg">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCreateProfileOpen(false)}
                  className="text-discord-text hover:bg-discord-hover"
                >
                  취소
                </Button>
                <Button
                  onClick={() => void handleSaveProfile()}
                  className="bg-discord-accent hover:bg-blue-600 text-white"
                  disabled={isProfileBusy || !newProfileName.trim()}
                >
                  {editingProfile ? '프로필 수정' : '프로필 생성'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-discord-bg rounded-xl p-6 w-full max-w-md border border-gray-700 flex flex-col items-center overflow-hidden">
                <div className="mb-6 text-center text-discord-text">
                  <div className="text-base font-medium mb-2">
                    {deleteTargetProfile
                      ? `정말로 ${deleteTargetProfile.name} 프로필을 삭제하시겠습니까?`
                      : '정말로 이 프로필을 삭제하시겠습니까?'}
                  </div>
                  <div className="text-red-400 font-semibold mb-2">
                    이 작업은 되돌릴 수 없습니다.
                  </div>
                  <div className="text-discord-muted text-sm">
                    아래에 <span className="font-semibold">프로필을 삭제하겠습니다</span>를 입력하세요
                  </div>
                </div>

                {isProfileBusy && (
                  <div className="mb-4 p-4 bg-discord-sidebar rounded-lg border border-gray-600">
                    <div className="flex items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-discord-accent"></div>
                      <div className="text-discord-text text-sm">
                        프로필 삭제 중...
                        <div className="text-discord-muted text-xs mt-1">
                          프로필 데이터와 카테고리를 정리 중
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
                  placeholder="프로필을 삭제하겠습니다"
                  disabled={isProfileBusy}
                />
                <div className="flex w-full gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1 text-discord-text hover:bg-discord-hover"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteInput('');
                      setDeleteTargetProfile(null);
                    }}
                    disabled={isProfileBusy}
                  >
                    취소
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 bg-discord-danger hover:bg-red-900 text-white disabled:bg-red-800 disabled:text-red-300 disabled:cursor-not-allowed"
                    disabled={deleteInput !== '프로필을 삭제하겠습니다' || isProfileBusy}
                    onClick={() => {
                      void handleDeleteProfile();
                    }}
                  >
                    {isProfileBusy ? '삭제 중...' : '삭제'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <LoadingOverlay />
        </div>
      </TooltipProvider>
  );
};

export default App;
