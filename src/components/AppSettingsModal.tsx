import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, HelpCircle, Keyboard, Languages, List, Loader2, Monitor, Plus, RefreshCw, Save, Settings, Shield, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { AppUpdateState, Config } from '../types';
import { DEFAULT_DATE_PARSE_FORMATS } from './ui/date-picker';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { DEFAULT_TRANSLATION_DISPLAY_MODE, OPENAI_TRANSLATION_MODEL, OPENAI_TRANSLATION_MODELS, type TranslationDisplayMode } from '../lib/translation';
import { toast } from './ui/use-toast';

interface AppSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDatabaseViewer: () => void;
  updateState: AppUpdateState;
  onOpenUpdate: () => void;
  onCheckForUpdates: () => void;
}

type SettingsSection = {
  id: string;
  label: string;
  description: string;
  icon: typeof Settings;
};

const sections: SettingsSection[] = [
  { id: 'general', label: '일반', description: '기본 동작과 창 옵션', icon: Settings },
  { id: 'list', label: '리스트', description: '레코드 리스트 표시 방식', icon: List },
  { id: 'viewer', label: '뷰어', description: '이미지와 동영상 보기 환경', icon: Monitor },
  { id: 'security', label: '보안', description: '프로그램 비밀번호 관리', icon: Shield },
];

const thumbnailPreviewScaleOptions = [100, 125, 150, 175, 200] as const;
const galleryZoomOptions = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200] as const;
const translationLanguageOptions = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: '영어' },
  { value: 'ja', label: '일본어' },
  { value: 'zh-CN', label: '중국어(간체)' },
  { value: 'zh-TW', label: '중국어(번체)' },
] as const;
const shortcutSections = [
  {
    title: '레코드 목록 페이지',
    description: '카테고리 레코드 리스트와 갤러리 화면에서 사용하는 단축키입니다.',
    items: [
      { keys: 'Ctrl+R / Cmd+R', description: '현재 카테고리에서 랜덤으로 레코드를 엽니다.' },
      { keys: 'F5', description: '현재 카테고리 레코드 목록을 새로고침합니다.' },
      { keys: 'Ctrl+F', description: '검색 입력창으로 포커스를 이동합니다.' },
      { keys: 'Ctrl+N', description: '새 레코드 등록 모달을 엽니다.' },
      { keys: 'F2', description: '선택된 레코드를 수정합니다.' },
      { keys: 'ArrowUp / ArrowDown', description: '현재 페이지 안에서 레코드 선택을 위아래로 이동합니다.' },
      { keys: 'Ctrl+ArrowLeft', description: '이전 페이지로 이동합니다.' },
      { keys: 'Ctrl+ArrowRight', description: '다음 페이지로 이동합니다.' },
    ],
  },
  {
    title: '레코드 상세 모달',
    description: '레코드 상세 정보 모달에서 사용하는 단축키입니다.',
    items: [
      { keys: 'Esc', description: '상세 모달을 닫습니다.' },
      { keys: 'Ctrl+Click', description: '텍스트 필드와 관계형 필드 값을 클립보드에 복사합니다.' },
    ],
  },
  {
    title: '파일 뷰어',
    description: '이미지, 동영상, 압축파일 뷰어에서 사용하는 단축키입니다.',
    items: [
      { keys: 'Esc', description: '뷰어를 닫습니다.' },
      { keys: 'Space', description: '동영상 재생 또는 일시정지를 전환합니다.' },
      { keys: 'F', description: '동영상 전체화면을 활성화하거나 해제합니다.' },
      { keys: 'ArrowLeft / ArrowRight', description: '동영상은 설정된 간격만큼 이동하고, 압축파일 내 이미지나 텍스트는 이전/다음 항목으로 이동합니다.' },
      { keys: 'ArrowUp / ArrowDown', description: '동영상은 볼륨을 조절하고, 압축파일 내 이미지나 텍스트는 이전/다음 항목으로 이동합니다.' },
      { keys: ', / .', description: '동영상을 뒤 또는 앞으로 1프레임씩 이동합니다.' },
      { keys: '[ / ]', description: '동영상 재생 속도를 한 단계 낮추거나 높입니다.' },
    ],
  },
] as const;
const getEffectiveDateParseFormats = (config: Config | null) => (
  Array.isArray(config?.dateParseFormats) && config.dateParseFormats.length > 0
    ? config.dateParseFormats
    : [...DEFAULT_DATE_PARSE_FORMATS]
);

export function AppSettingsModal({
  open,
  onOpenChange,
  onOpenDatabaseViewer,
  updateState,
  onOpenUpdate,
  onCheckForUpdates,
}: AppSettingsModalProps) {
  const { setLoading: setGlobalLoading, hideLoading } = useLoadingStore();
  const [activeSection, setActiveSection] = useState('general');
  const [config, setConfig] = useState<Config | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [passwordLockAttempts, setPasswordLockAttempts] = useState('5');
  const [passwordLockMinutes, setPasswordLockMinutes] = useState('1');
  const [passwordLockMessage, setPasswordLockMessage] = useState('');
  const [idleLockMinutesInput, setIdleLockMinutesInput] = useState('5');
  const [idleLockMessage, setIdleLockMessage] = useState('');
  const [generalMessage, setGeneralMessage] = useState('');
  const [zoomPercentInput, setZoomPercentInput] = useState('100');
  const [backupIntervalInput, setBackupIntervalInput] = useState('60');
  const [backupMessage, setBackupMessage] = useState('');
  const [thumbnailCleanupMessage, setThumbnailCleanupMessage] = useState('');
  const [thumbnailCleanupConfirmVisible, setThumbnailCleanupConfirmVisible] = useState(false);
  const [viewerSeekSeconds, setViewerSeekSeconds] = useState('5');
  const [viewerMessage, setViewerMessage] = useState('');
  const [viewerAutoPlayMessage, setViewerAutoPlayMessage] = useState('');
  const [listMessage, setListMessage] = useState('');
  const [dateFormatInput, setDateFormatInput] = useState('');
  const [dateFormatMessage, setDateFormatMessage] = useState('');
  const [translationApiKeyInput, setTranslationApiKeyInput] = useState('');
  const [translationMessage, setTranslationMessage] = useState('');

  const settingsSections = useMemo(() => {
    const shortcutsSection = {
      id: 'shortcuts',
      label: '단축키',
      description: '페이지별 키보드 도움말',
      icon: Keyboard,
    };
    const translationSection = {
      id: 'translation',
      label: '번역',
      description: '자동 번역과 OpenAI 설정',
      icon: Languages,
    };
    const dataSection = {
      id: 'data',
      label: '데이터',
      description: '데이터베이스와 백업 관리',
      icon: Save,
    };
    const securityIndex = sections.findIndex((section) => section.id === 'security');
    const alreadyExists =
      sections.some((section) => section.id === shortcutsSection.id) ||
      sections.some((section) => section.id === translationSection.id) ||
      sections.some((section) => section.id === dataSection.id);

    if (alreadyExists) {
      return sections;
    }

    if (securityIndex < 0) {
      return [...sections, shortcutsSection, translationSection, dataSection];
    }

    return [
      ...sections.slice(0, securityIndex),
      shortcutsSection,
      translationSection,
      dataSection,
      ...sections.slice(securityIndex),
    ];
  }, []);

  const currentSection = useMemo(
    () => settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0],
    [activeSection, settingsSections]
  );

  useEffect(() => {
    if (!open) return;

    const preventMouseBackClose = (e: MouseEvent) => {
      if (e.button !== 3) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    window.addEventListener('mousedown', preventMouseBackClose, true);
    window.addEventListener('mouseup', preventMouseBackClose, true);
    window.addEventListener('auxclick', preventMouseBackClose, true);

    return () => {
      window.removeEventListener('mousedown', preventMouseBackClose, true);
      window.removeEventListener('mouseup', preventMouseBackClose, true);
      window.removeEventListener('auxclick', preventMouseBackClose, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    window.electronAPI
      .getConfig()
      .then((nextConfig: Config) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setPassword('');
        setPasswordConfirm('');
        setSecurityMessage('');
        setPasswordLockAttempts(String(nextConfig.passwordLockMaxAttempts ?? 5));
        setPasswordLockMinutes(String(nextConfig.passwordLockDurationMinutes ?? 1));
        setPasswordLockMessage('');
        setIdleLockMinutesInput(String(nextConfig.idleLockMinutes && nextConfig.idleLockMinutes > 0 ? nextConfig.idleLockMinutes : 5));
        setIdleLockMessage('');
        setGeneralMessage('');
        setZoomPercentInput(String(nextConfig.zoomPercent ?? 100));
        setBackupIntervalInput(String(Math.max(1, nextConfig.backupInterval ?? 60)));
        setBackupMessage('');
        setThumbnailCleanupMessage('');
        setThumbnailCleanupConfirmVisible(false);
        setViewerSeekSeconds(String(nextConfig.videoSeekSeconds ?? 5));
        setViewerMessage('');
        setViewerAutoPlayMessage('');
        setListMessage('');
        setDateFormatInput('');
        setDateFormatMessage('');
        setTranslationApiKeyInput('');
        setTranslationMessage('');
      })
      .catch((error) => {
        console.error('Failed to load app settings:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !config) return;

    const rawValue = zoomPercentInput.trim();
    if (!rawValue) {
      setGeneralMessage('');
      return;
    }

    const percent = Number(rawValue);
    if (!Number.isFinite(percent) || percent < 50 || percent > 200) {
      setGeneralMessage('확대 배율은 50%에서 200% 사이로 설정해야 합니다.');
      return;
    }

    const normalized = Math.round(percent);
    if ((config.zoomPercent ?? 100) === normalized) {
      setGeneralMessage('');
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        const result = await window.electronAPI.setZoomPercent(normalized);
        if (result.success) {
          setConfig((prev) => (prev ? { ...prev, zoomPercent: normalized } : prev));
          setZoomPercentInput(String(normalized));
          setGeneralMessage('');
          return;
        }

        setGeneralMessage(result.error || '일반 설정 저장에 실패했습니다.');
      } finally {
        setIsSaving(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [config, open, zoomPercentInput]);

  useEffect(() => {
    if (!open || !config) return;

    const rawValue = viewerSeekSeconds.trim();
    if (!rawValue) {
      setViewerMessage('');
      return;
    }

    const seconds = Number(rawValue);
    if (!Number.isFinite(seconds) || seconds < 1) {
      setViewerMessage('이동 간격은 1초 이상이어야 합니다.');
      return;
    }

    const normalized = Math.floor(seconds);
    if ((config.videoSeekSeconds ?? 5) === normalized) {
      setViewerMessage('');
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        const result = await window.electronAPI.setVideoSeekSeconds(normalized);
        if (result.success) {
          setConfig((prev) => (prev ? { ...prev, videoSeekSeconds: normalized } : prev));
          setViewerSeekSeconds(String(normalized));
          setViewerMessage('');
          return;
        }

        setViewerMessage(result.error || '뷰어 설정 저장에 실패했습니다.');
      } finally {
        setIsSaving(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [config, open, viewerSeekSeconds]);

  const handleRememberWindowBoundsChange = async (checked: boolean) => {
    setConfig((prev) => (prev ? { ...prev, rememberWindowBounds: checked } : prev));
    setIsSaving(true);
    try {
      await window.electronAPI.setRememberWindowBounds(checked);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackup = async () => {
    setIsSaving(true);
    setBackupMessage('');
    try {
      const result = await window.electronAPI.backupDatabase();
      if (result.success) {
        toast({
          title: '백업 완료',
          description: '데이터베이스 백업이 완료되었습니다.',
        });
        return;
      }

      const errorMessage = result.error || '데이터베이스 백업에 실패했습니다.';
      setBackupMessage(errorMessage);
      toast({
        title: '백업 실패',
        description: errorMessage,
        variant: 'destructive',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '데이터베이스 백업에 실패했습니다.';
      setBackupMessage(errorMessage);
      toast({
        title: '백업 실패',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenBackupLocation = async () => {
    setBackupMessage('');
    try {
      const result = await window.electronAPI.openBackupLocation();
      if (!result.success) {
        setBackupMessage(result.error || '백업 폴더를 열 수 없습니다.');
      }
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : '백업 폴더를 열 수 없습니다.');
    }
  };

  const handleSetBackupDir = async () => {
    setIsSaving(true);
    setBackupMessage('');
    try {
      const result = await window.electronAPI.setBackupDir();
      if (result.success && result.path) {
        setConfig((prev) => (prev ? { ...prev, backupDir: result.path } : prev));
        setBackupMessage('백업 폴더가 변경되었습니다.');
      } else if (result.error) {
        setBackupMessage(result.error);
      }
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : '백업 폴더 변경에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackupEnabledChange = async (enabled: boolean) => {
    const previousValue = config?.backupEnabled !== false;
    setConfig((prev) => (prev ? { ...prev, backupEnabled: enabled } : prev));
    setBackupMessage('');
    setIsSaving(true);
    try {
      const result = await window.electronAPI.setBackupEnabled(enabled);
      if (result.success) {
        const savedValue = result.backupEnabled ?? enabled;
        setConfig((prev) => (prev ? { ...prev, backupEnabled: savedValue } : prev));
        setBackupMessage(savedValue ? '자동 백업이 켜졌습니다.' : '자동 백업이 꺼졌습니다.');
      } else {
        setConfig((prev) => (prev ? { ...prev, backupEnabled: previousValue } : prev));
        setBackupMessage(result.error || '자동 백업 설정 변경에 실패했습니다.');
      }
    } catch (error) {
      setConfig((prev) => (prev ? { ...prev, backupEnabled: previousValue } : prev));
      setBackupMessage(error instanceof Error ? error.message : '자동 백업 설정 변경에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetBackupInterval = async () => {
    const minutes = Number(backupIntervalInput);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      setBackupMessage('백업 주기는 1분에서 10,080분 사이의 정수로 설정해야 합니다.');
      return;
    }

    setIsSaving(true);
    setBackupMessage('');
    try {
      const result = await window.electronAPI.setBackupInterval(minutes);
      if (result.success) {
        setConfig((prev) => (prev ? { ...prev, backupInterval: minutes } : prev));
        setBackupIntervalInput(String(minutes));
        setBackupMessage('백업 주기가 변경되었습니다.');
      } else {
        setBackupMessage(result.error || '백업 주기 변경에 실패했습니다.');
      }
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : '백업 주기 변경에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanupOrphanThumbnails = async () => {
    setThumbnailCleanupConfirmVisible(false);
    setThumbnailCleanupMessage('');
    setIsSaving(true);
    hideLoading();
    setGlobalLoading(true, '연결되지 않은 썸네일 파일을 정리하는 중...');

    try {
      const result = await window.electronAPI.cleanupOrphanThumbnails();
      if (!result.success) {
        setThumbnailCleanupMessage(result.error || '썸네일 파일 정리에 실패했습니다.');
        return;
      }

      const reclaimedSize = result.reclaimedBytes >= 1024 * 1024
        ? `${(result.reclaimedBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(result.reclaimedBytes / 1024).toFixed(1)} KB`;
      const notes = [];
      if (result.skippedRecentFiles > 0) {
        notes.push(`최근 생성된 파일 ${result.skippedRecentFiles}개는 안전을 위해 제외했습니다.`);
      }
      if (result.errors.length > 0) {
        notes.push(`처리하지 못한 파일이 ${result.errors.length}개 있습니다.`);
      }

      setThumbnailCleanupMessage(
        `미참조 썸네일 ${result.deletedFiles}개를 삭제하여 ${reclaimedSize}를 확보했습니다.` +
        (notes.length > 0 ? ` ${notes.join(' ')}` : '')
      );
    } catch (error) {
      setThumbnailCleanupMessage(error instanceof Error ? error.message : '썸네일 파일 정리에 실패했습니다.');
    } finally {
      hideLoading();
      setIsSaving(false);
    }
  };

  const handleMuteAudioWhenBackgroundedChange = async (checked: boolean) => {
    const previousValue = Boolean(config?.muteAudioWhenBackgrounded);
    setConfig((prev) => (prev ? { ...prev, muteAudioWhenBackgrounded: checked } : prev));
    setGeneralMessage('');
    setIsSaving(true);
    try {
      const result = await window.electronAPI.setMuteAudioWhenBackgrounded(checked);
      if (!result.success) {
        setConfig((prev) => (prev ? { ...prev, muteAudioWhenBackgrounded: previousValue } : prev));
        setGeneralMessage('일반 설정 저장에 실패했습니다.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleListThumbnailFitChange = async (fit: 'cover' | 'contain') => {
    const previousFit = config?.listThumbnailFit === 'contain' ? 'contain' : 'cover';
    setConfig((prev) => (prev ? { ...prev, listThumbnailFit: fit } : prev));
    setListMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setListThumbnailFit(fit);
      if (result.success) {
        window.dispatchEvent(new CustomEvent('config:updated', { detail: { listThumbnailFit: fit } }));
        return;
      }

      setConfig((prev) => (prev ? { ...prev, listThumbnailFit: previousFit } : prev));
      setListMessage(result.error || '리스트 설정 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVideoHoverPreviewEnabledChange = async (enabled: boolean) => {
    const previousValue = config?.videoHoverPreviewEnabled !== false;
    setConfig((prev) => (prev ? { ...prev, videoHoverPreviewEnabled: enabled } : prev));
    setListMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setVideoHoverPreviewEnabled(enabled);
      if (result.success) {
        window.dispatchEvent(new CustomEvent('config:updated', {
          detail: { videoHoverPreviewEnabled: enabled }
        }));
        return;
      }

      setConfig((prev) => (prev ? { ...prev, videoHoverPreviewEnabled: previousValue } : prev));
      setListMessage(result.error || '동영상 미리보기 설정 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleThumbnailPreviewScaleChange = async (scale: number) => {
    const previousScale = Math.min(200, Math.max(75, Number(config?.thumbnailPreviewScale ?? 100)));
    setConfig((prev) => (prev ? { ...prev, thumbnailPreviewScale: scale } : prev));
    setListMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setThumbnailPreviewScale(scale);
      if (result.success) {
        window.dispatchEvent(new CustomEvent('config:updated', { detail: { thumbnailPreviewScale: scale } }));
        return;
      }

      setConfig((prev) => (prev ? { ...prev, thumbnailPreviewScale: previousScale } : prev));
      setListMessage(result.error || '썸네일 미리보기 배율 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDefaultGalleryZoomChange = async (scale: number) => {
    const previousScale = Math.min(200, Math.max(50, Number(config?.defaultGalleryZoom ?? 100)));
    setConfig((prev) => (prev ? { ...prev, defaultGalleryZoom: scale } : prev));
    setListMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setDefaultGalleryZoom(scale);
      if (result.success) {
        const savedScale = result.defaultGalleryZoom ?? scale;
        setConfig((prev) => (prev ? { ...prev, defaultGalleryZoom: savedScale } : prev));
        window.dispatchEvent(new CustomEvent('config:updated', { detail: { defaultGalleryZoom: savedScale } }));
        return;
      }

      setConfig((prev) => (prev ? { ...prev, defaultGalleryZoom: previousScale } : prev));
      setListMessage(result.error || '갤러리뷰 기본 배율 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveDateParseFormats = async (formats: string[]) => {
    const normalizedFormats = Array.from(new Set(formats.map((item) => item.trim()).filter(Boolean)));
    setConfig((prev) => (prev ? { ...prev, dateParseFormats: normalizedFormats } : prev));
    setDateFormatMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setDateParseFormats(normalizedFormats);
      if (result.success) {
        const savedFormats = result.dateParseFormats ?? normalizedFormats;
        setConfig((prev) => (prev ? { ...prev, dateParseFormats: savedFormats } : prev));
        window.dispatchEvent(new CustomEvent('config:updated', { detail: { dateParseFormats: savedFormats } }));
        return;
      }

      setDateFormatMessage(result.error || '날짜 변환 서식 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDateParseFormat = async () => {
    const nextFormat = dateFormatInput.trim();
    if (!nextFormat) return;

    const dateFormats = getEffectiveDateParseFormats(config);
    const formatSet = new Set(dateFormats.map((item) => item.toLowerCase()));

    if (formatSet.has(nextFormat.toLowerCase())) {
      setDateFormatMessage('이미 등록된 날짜 변환 서식입니다.');
      return;
    }

    await saveDateParseFormats([...dateFormats, nextFormat]);
    setDateFormatInput('');
  };

  const handleDeleteDateParseFormat = async (dateFormat: string) => {
    await saveDateParseFormats(getEffectiveDateParseFormats(config).filter((item) => item !== dateFormat));
  };

  const handleResetDateParseFormats = async () => {
    await saveDateParseFormats([...DEFAULT_DATE_PARSE_FORMATS]);
  };

  const handleVideoAutoPlayChange = async (checked: boolean) => {
    setConfig((prev) => (prev ? { ...prev, videoAutoPlay: checked } : prev));
    setViewerAutoPlayMessage('');
    setIsSaving(true);
    try {
      const result = await window.electronAPI.setVideoAutoPlay(checked);
      if (!result.success) {
        setConfig((prev) => (prev ? { ...prev, videoAutoPlay: !checked } : prev));
        setViewerAutoPlayMessage(result.error || '뷰어 설정 저장에 실패했습니다.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTranslationTargetLanguageChange = async (language: string) => {
    if (!config) return;

    const previousLanguage = config.translationTargetLanguage || 'ko';
    setConfig((prev) => (prev ? { ...prev, translationTargetLanguage: language } : prev));
    setTranslationMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setTranslationTargetLanguage(language);
      if (result.success) {
        const savedLanguage = result.translationTargetLanguage || language;
        setConfig((prev) => (prev ? { ...prev, translationTargetLanguage: savedLanguage } : prev));
        return;
      }

      setConfig((prev) => (prev ? { ...prev, translationTargetLanguage: previousLanguage } : prev));
      setTranslationMessage(result.error || '번역 언어 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTranslationModelChange = async (model: string) => {
    if (!config) return;

    const previousModel = config.translationModel || OPENAI_TRANSLATION_MODEL;
    setConfig((prev) => (prev ? { ...prev, translationModel: model } : prev));
    setTranslationMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setTranslationModel(model);
      if (result.success) {
        const savedModel = result.translationModel || model;
        setConfig((prev) => (prev ? { ...prev, translationModel: savedModel } : prev));
        setTranslationMessage('번역 모델이 변경되었습니다.');
        return;
      }

      setConfig((prev) => (prev ? { ...prev, translationModel: previousModel } : prev));
      setTranslationMessage(result.error || '번역 모델 저장에 실패했습니다.');
    } catch (error) {
      setConfig((prev) => (prev ? { ...prev, translationModel: previousModel } : prev));
      setTranslationMessage(error instanceof Error ? error.message : '번역 모델 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTranslationDisplayModeChange = async (mode: TranslationDisplayMode) => {
    if (!config) return;

    const previousMode = config.translationDisplayMode === 'inline-hover' ? 'inline-hover' : DEFAULT_TRANSLATION_DISPLAY_MODE;
    setConfig((prev) => (prev ? { ...prev, translationDisplayMode: mode } : prev));
    setTranslationMessage('');
    setIsSaving(true);

    try {
      const result = await window.electronAPI.setTranslationDisplayMode(mode);
      if (result.success) {
        const savedMode = result.translationDisplayMode === 'inline-hover' ? 'inline-hover' : DEFAULT_TRANSLATION_DISPLAY_MODE;
        setConfig((prev) => (prev ? { ...prev, translationDisplayMode: savedMode } : prev));
        window.dispatchEvent(new CustomEvent('config:updated', { detail: { translationDisplayMode: savedMode } }));
        return;
      }

      setConfig((prev) => (prev ? { ...prev, translationDisplayMode: previousMode } : prev));
      setTranslationMessage(result.error || '번역 표시 방식 저장에 실패했습니다.');
    } catch (error) {
      setConfig((prev) => (prev ? { ...prev, translationDisplayMode: previousMode } : prev));
      setTranslationMessage(error instanceof Error ? error.message : '번역 표시 방식 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOpenAiApiKey = async () => {
    const normalizedApiKey = translationApiKeyInput.trim();
    if (!normalizedApiKey) {
      setTranslationMessage('OpenAI API 키를 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.electronAPI.setOpenAiApiKey(normalizedApiKey);
      if (result.success) {
        setConfig((prev) => (prev ? { ...prev, hasOpenAiApiKey: true } : prev));
        setTranslationApiKeyInput('');
        setTranslationMessage('OpenAI API 키가 저장되었습니다.');
        return;
      }

      setTranslationMessage(result.error || 'OpenAI API 키 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearOpenAiApiKey = async () => {
    setIsSaving(true);
    try {
      const result = await window.electronAPI.clearOpenAiApiKey();
      if (result.success) {
        setConfig((prev) => (prev ? { ...prev, hasOpenAiApiKey: false } : prev));
        setTranslationApiKeyInput('');
        setTranslationMessage('저장된 OpenAI API 키가 제거되었습니다.');
        return;
      }

      setTranslationMessage(result.error || 'OpenAI API 키 삭제에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!password || password.length < 4) {
      setSecurityMessage('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setSecurityMessage('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSaving(true);
    const result = await window.electronAPI.setAppPassword(password);
    setIsSaving(false);

    if (result.success) {
      setConfig((prev) => (prev ? { ...prev, hasAppPassword: true } : prev));
      setPassword('');
      setPasswordConfirm('');
      setSecurityMessage('비밀번호가 설정되었습니다.');
      window.dispatchEvent(new CustomEvent('config:updated', { detail: { hasAppPassword: true } }));
      return;
    }

    setSecurityMessage(result.error || '비밀번호 설정에 실패했습니다.');
  };

  const handleClearPassword = async () => {
    setIsSaving(true);
    const result = await window.electronAPI.clearAppPassword();
    setIsSaving(false);

    if (result.success) {
      setConfig((prev) => (prev ? { ...prev, hasAppPassword: false } : prev));
      setPassword('');
      setPasswordConfirm('');
      setSecurityMessage('비밀번호가 해제되었습니다.');
      window.dispatchEvent(new CustomEvent('config:updated', { detail: { hasAppPassword: false } }));
      return;
    }

    setSecurityMessage(result.error || '비밀번호 해제에 실패했습니다.');
  };

  const handleSavePasswordLockSettings = async () => {
    const maxAttempts = Number(passwordLockAttempts);
    const durationMinutes = Number(passwordLockMinutes);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      setPasswordLockMessage('실패 횟수는 1회에서 20회 사이의 정수로 설정해야 합니다.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setPasswordLockMessage('잠금 시간은 1분에서 1,440분 사이의 정수로 설정해야 합니다.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.electronAPI.setPasswordLockSettings(maxAttempts, durationMinutes);
      if (!result.success) {
        setPasswordLockMessage(result.error || '로그인 잠금 설정 저장에 실패했습니다.');
        return;
      }

      setConfig((prev) => prev ? {
        ...prev,
        passwordLockMaxAttempts: result.passwordLockMaxAttempts ?? maxAttempts,
        passwordLockDurationMinutes: result.passwordLockDurationMinutes ?? durationMinutes,
      } : prev);
      setPasswordLockAttempts(String(result.passwordLockMaxAttempts ?? maxAttempts));
      setPasswordLockMinutes(String(result.passwordLockDurationMinutes ?? durationMinutes));
      setPasswordLockMessage('로그인 잠금 설정이 저장되었습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const persistIdleLockMinutes = async (minutes: number) => {
    setIsSaving(true);
    try {
      const result = await window.electronAPI.setIdleLockMinutes(minutes);
      if (!result.success) {
        setIdleLockMessage(result.error || '자리 비움 잠금 설정 저장에 실패했습니다.');
        return;
      }

      const savedMinutes = result.idleLockMinutes ?? minutes;
      setConfig((prev) => (prev ? { ...prev, idleLockMinutes: savedMinutes } : prev));
      if (savedMinutes > 0) {
        setIdleLockMinutesInput(String(savedMinutes));
      }
      window.dispatchEvent(new CustomEvent('config:updated', { detail: { idleLockMinutes: savedMinutes } }));
      setIdleLockMessage(savedMinutes > 0
        ? `${savedMinutes}분 동안 입력이 없으면 앱을 잠급니다.`
        : '자리 비움 시 자동 잠금이 꺼졌습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleIdleLockEnabledChange = async (enabled: boolean) => {
    if (enabled && !config?.hasAppPassword) {
      setIdleLockMessage('자리 비움 잠금을 쓰려면 먼저 프로그램 비밀번호를 설정하세요.');
      return;
    }

    if (!enabled) {
      await persistIdleLockMinutes(0);
      return;
    }

    const minutes = Number(idleLockMinutesInput);
    const nextMinutes = Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : 5;
    setIdleLockMinutesInput(String(nextMinutes));
    await persistIdleLockMinutes(nextMinutes);
  };

  const handleSaveIdleLockMinutes = async () => {
    if (!config?.hasAppPassword) {
      setIdleLockMessage('자리 비움 잠금을 쓰려면 먼저 프로그램 비밀번호를 설정하세요.');
      return;
    }

    const minutes = Number(idleLockMinutesInput);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setIdleLockMessage('자리 비움 시간은 1분에서 1,440분 사이의 정수로 설정해야 합니다.');
      return;
    }

    await persistIdleLockMinutes(minutes);
  };

  const renderGeneralSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">프로그램 위치 기억</div>
            <p className="text-sm text-discord-muted mt-2 leading-6">
              프로그램을 다시 실행했을 때 마지막으로 사용한 창의 위치와 크기를 그대로 복원합니다.
            </p>
          </div>
          <Switch
            checked={Boolean(config?.rememberWindowBounds)}
            onCheckedChange={handleRememberWindowBoundsChange}
            disabled={!config || isSaving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">백그라운드 음소거</div>
            <p className="text-sm text-discord-muted mt-2 leading-6">
              앱이 다른 창 뒤로 가거나 포커스를 잃으면 앱에서 재생 중인 오디오를 자동으로 음소거합니다.
            </p>
          </div>
          <Switch
            checked={Boolean(config?.muteAudioWhenBackgrounded)}
            onCheckedChange={handleMuteAudioWhenBackgroundedChange}
            disabled={!config || isSaving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">UI 확대 배율</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          앱 전체 화면에 적용할 확대 배율을 고정합니다. 단축키나 UI 기본 확대/축소로는 변경되지 않습니다.
        </p>

        <div className="mt-5 flex items-end gap-3 max-w-md">
          <div className="flex-1">
            <div className="text-xs text-discord-muted mb-2">확대 배율</div>
            <Input
              type="number"
              min="50"
              max="200"
              step="1"
              value={zoomPercentInput}
              onChange={(e) => {
                setZoomPercentInput(e.target.value);
                setGeneralMessage('');
              }}
              disabled={!config || isSaving}
              className="bg-discord-bg border-gray-600 text-discord-text"
            />
          </div>
          <div className="text-sm text-discord-muted pb-2">%</div>
        </div>

        {generalMessage && <p className="text-sm text-discord-muted mt-2">{generalMessage}</p>}
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">날짜 변환 서식</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          날짜 필드에 붙여넣거나 입력할 때 인식할 서식을 추가합니다. 예: YYYY. MM. DD
        </p>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs text-discord-muted">서식 리스트</div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleResetDateParseFormats()}
              disabled={!config || isSaving}
              className="h-8 border-gray-600 px-3 text-xs hover:bg-discord-hover text-discord-text"
            >
              기본값으로 초기화
            </Button>
          </div>
          <div className="flex max-w-xl gap-2">
            <Input
              value={dateFormatInput}
              onChange={(e) => {
                setDateFormatInput(e.target.value);
                setDateFormatMessage('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddDateParseFormat();
                }
              }}
              placeholder="YYYY. MM. DD"
              disabled={!config || isSaving}
              className="bg-discord-bg border-gray-600 text-discord-text"
            />
            <Button
              type="button"
              onClick={() => void handleAddDateParseFormat()}
              disabled={!config || isSaving || !dateFormatInput.trim()}
              className="bg-discord-accent hover:bg-blue-600 text-white"
            >
              <Plus size={16} />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {getEffectiveDateParseFormats(config).length === 0 ? (
              <span className="text-xs text-discord-muted">등록된 날짜 변환 서식이 없습니다.</span>
            ) : (
              getEffectiveDateParseFormats(config).map((dateFormat) => (
                <span
                  key={dateFormat}
                  className="inline-flex items-center gap-2 rounded border border-gray-700 bg-discord-bg px-2 py-1 text-xs text-discord-text"
                >
                  {dateFormat}
                  <button
                    type="button"
                    onClick={() => void handleDeleteDateParseFormat(dateFormat)}
                    disabled={isSaving}
                    className="text-discord-muted hover:text-red-400 disabled:opacity-50"
                    aria-label={`${dateFormat} 삭제`}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {dateFormatMessage && <p className="text-sm text-discord-muted mt-2">{dateFormatMessage}</p>}
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">버전 업데이트</div>
            <p className="mt-2 text-sm leading-6 text-discord-muted">
              새로운 Local ERP 버전을 확인하고 설치합니다.
            </p>
          </div>
          <Button
            type="button"
            variant={updateState.updateAvailable ? 'default' : 'outline'}
            onClick={updateState.updateAvailable ? onOpenUpdate : onCheckForUpdates}
            disabled={updateState.status === 'checking' || updateState.status === 'disabled'}
            className={updateState.updateAvailable
              ? 'shrink-0 bg-yellow-600 text-white hover:bg-yellow-700'
              : 'shrink-0 border-gray-600 text-discord-text hover:bg-discord-hover'}
          >
            {updateState.status === 'checking'
              ? <Loader2 size={16} className="mr-2 animate-spin" />
              : <RefreshCw size={16} className="mr-2" />}
            {updateState.updateAvailable ? '업데이트' : '업데이트 확인'}
          </Button>
        </div>

        <div className="mt-5 grid max-w-xl grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-700 bg-discord-bg/80 px-4 py-3">
            <div className="text-xs text-discord-muted">현재 버전</div>
            <div className="mt-1 text-sm font-medium text-white">v{updateState.currentVersion}</div>
          </div>
          <div className="rounded-lg border border-gray-700 bg-discord-bg/80 px-4 py-3">
            <div className="text-xs text-discord-muted">신규 버전</div>
            <div className={`mt-1 text-sm font-medium ${updateState.updateAvailable ? 'text-yellow-400' : 'text-white'}`}>
              {updateState.updateAvailable && updateState.latestVersion
                ? `v${updateState.latestVersion}`
                : '없음'}
            </div>
          </div>
        </div>

        {updateState.status === 'disabled' && (
          <p className="mt-3 text-xs text-discord-muted">
            자동 업데이트 확인은 설치된 앱에서 사용할 수 있습니다.
          </p>
        )}
        {updateState.error && (
          <p className="mt-3 text-sm text-red-400">{updateState.error}</p>
        )}
      </div>

    </div>
  );

  const renderDataSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">데이터베이스 보기</div>
            <p className="mt-2 text-sm leading-6 text-discord-muted">
              프로필과 무관한 전체 데이터베이스 정보를 확인합니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenDatabaseViewer}
            className="border-gray-600 text-discord-text hover:bg-discord-hover"
          >
            열기
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">데이터베이스 백업</div>
            <p className="mt-2 text-sm leading-6 text-discord-muted">
              현재 데이터베이스를 백업 폴더에 즉시 저장합니다.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void handleBackup()}
            disabled={!config || isSaving}
            className="bg-discord-accent text-white hover:bg-blue-600"
          >
            <Save size={16} className="mr-2" />
            백업하기
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">백업 폴더 위치</div>
        <p className="mt-2 text-sm leading-6 text-discord-muted">
          데이터베이스 백업 파일이 저장될 폴더입니다.
        </p>
        <div className="mt-5 flex max-w-3xl gap-2">
          <Input
            value={config?.backupDir ?? ''}
            readOnly
            className="flex-1 border-gray-600 bg-discord-bg text-discord-text"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleOpenBackupLocation()}
            disabled={!config}
            className="border-gray-600 text-discord-text hover:bg-discord-hover"
          >
            <FolderOpen size={16} className="mr-2" />
            열기
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSetBackupDir()}
            disabled={!config || isSaving}
            className="border-gray-600 text-discord-text hover:bg-discord-hover"
          >
            변경
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">자동 백업</div>
            <p className="mt-2 text-sm leading-6 text-discord-muted">
              자동 백업을 켜고 실행 간격을 분 단위로 설정합니다.
            </p>
          </div>
          <Switch
            checked={config?.backupEnabled !== false}
            onCheckedChange={(checked) => void handleBackupEnabledChange(checked)}
            disabled={!config || isSaving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>
        <div className="mt-5 flex max-w-md items-end gap-3">
          <div className="flex-1">
            <div className="mb-2 text-xs text-discord-muted">실행 간격</div>
            <Input
              type="number"
              min="1"
              max="10080"
              step="1"
              value={backupIntervalInput}
              onChange={(event) => {
                setBackupIntervalInput(event.target.value);
                setBackupMessage('');
              }}
              disabled={!config || isSaving || config.backupEnabled === false}
              className="border-gray-600 bg-discord-bg text-discord-text"
            />
          </div>
          <div className="pb-2 text-sm text-discord-muted">분</div>
          <Button
            type="button"
            onClick={() => void handleSetBackupInterval()}
            disabled={!config || isSaving || config.backupEnabled === false}
            className="bg-discord-accent text-white hover:bg-blue-600"
          >
            저장
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">썸네일 파일 정리</div>
            <p className="mt-2 text-sm leading-6 text-discord-muted">
              모든 프로필의 레코드가 참조하지 않는 썸네일 파일을 삭제하고 빈 폴더를 정리합니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setThumbnailCleanupConfirmVisible(true)}
            disabled={isSaving}
            className="shrink-0 border-gray-600 text-discord-text hover:bg-discord-hover"
          >
            <Trash2 size={16} className="mr-2" />
            정리하기
          </Button>
        </div>

        {thumbnailCleanupConfirmVisible && (
          <div className="mt-4 rounded-lg border border-yellow-700/60 bg-yellow-950/30 p-4">
            <p className="text-sm leading-6 text-yellow-100">
              연결되지 않은 썸네일 파일은 복구할 수 없습니다. 정리를 시작할까요?
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setThumbnailCleanupConfirmVisible(false)}
                className="text-discord-text hover:bg-discord-hover"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void handleCleanupOrphanThumbnails()}
                className="bg-yellow-600 text-white hover:bg-yellow-700"
              >
                정리 시작
              </Button>
            </div>
          </div>
        )}

        {thumbnailCleanupMessage && (
          <p className="mt-4 text-sm leading-6 text-discord-muted">{thumbnailCleanupMessage}</p>
        )}
      </div>

      {backupMessage && <p className="text-sm text-discord-muted">{backupMessage}</p>}
    </div>
  );

  const renderListSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-white">썸네일 표시 방법</div>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-discord-muted hover:text-discord-text transition-colors"
                  aria-label="썸네일 표시 방법 설명"
                >
                  <HelpCircle size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words"
              >
                <div>Cover: 썸네일 영역을 꽉 채웁니다. 일부 가장자리가 잘릴 수 있습니다.</div>
                <div className="mt-1">Contain: 원본 전체가 보이도록 맞춥니다. 여백이 생길 수 있습니다.</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          리스트에서 썸네일을 셀에 꽉 채워 보여줄지, 원본 비율을 유지하며 전체가 보이도록 보여줄지 선택합니다.
        </p>

        <div className="mt-5 max-w-md">
          <div className="text-xs text-discord-muted mb-2">표시 방식</div>
          <Select
            value={config?.listThumbnailFit === 'contain' ? 'contain' : 'cover'}
            onValueChange={(value: 'cover' | 'contain') => void handleListThumbnailFitChange(value)}
            disabled={!config || isSaving}
          >
            <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectItem
                value="cover"
                className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
              >
                Cover
              </SelectItem>
              <SelectItem
                value="contain"
                className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
              >
                Contain
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-5 max-w-md">
          <div className="text-xs text-discord-muted mb-2">미리보기 배율</div>
          <Select
            value={String(config?.thumbnailPreviewScale ?? 100)}
            onValueChange={(value) => void handleThumbnailPreviewScaleChange(Number(value))}
            disabled={!config || isSaving}
          >
            <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600 text-discord-text">
              {thumbnailPreviewScaleOptions.map((scale) => (
                <SelectItem
                  key={scale}
                  value={String(scale)}
                  className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
                >
                  {scale}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">동영상 미리보기</div>
            <p className="text-sm text-discord-muted mt-2 leading-6">
              동영상 썸네일에 커서를 올리면 테이블에서는 우측 하단, 갤러리에서는 썸네일 영역에서 무음으로 재생합니다.
            </p>
          </div>
          <Switch
            checked={config?.videoHoverPreviewEnabled !== false}
            onCheckedChange={(checked) => void handleVideoHoverPreviewEnabledChange(checked)}
            disabled={!config || isSaving}
            className="shrink-0 data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">갤러리뷰 기본 배율</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          카테고리별로 갤러리 배율을 조절하지 않은 경우 이 값을 사용합니다. Ctrl+휠로 바꾼 배율은 해당 카테고리에만 저장됩니다.
        </p>

        <div className="mt-5 max-w-md">
          <div className="text-xs text-discord-muted mb-2">기본 배율</div>
          <Select
            value={String(config?.defaultGalleryZoom ?? 100)}
            onValueChange={(value) => void handleDefaultGalleryZoomChange(Number(value))}
            disabled={!config || isSaving}
          >
            <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600 text-discord-text">
              {galleryZoomOptions.map((scale) => (
                <SelectItem
                  key={scale}
                  value={String(scale)}
                  className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
                >
                  {scale}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {listMessage && <p className="text-sm text-discord-muted">{listMessage}</p>}
    </div>
  );

  const renderTranslationSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">OpenAI 준비 순서</div>
        <p className="mt-2 text-sm leading-6 text-discord-muted">
          자동 번역을 쓰려면 먼저 OpenAI 사이트에서 API 결제 설정을 마쳐야 합니다.
        </p>
        <div className="mt-4 space-y-2 rounded-lg border border-gray-700 bg-discord-bg/80 px-4 py-4 text-sm text-discord-text">
          <div>1. OpenAI 계정으로 로그인합니다.</div>
          <div>2. 결제 수단에서 카드를 등록하고 API 크레딧을 충전합니다.</div>
          <div>3. API Keys 메뉴에서 새 API 키를 생성합니다.</div>
          <div>4. 생성한 키를 이 화면의 OpenAI API 키 입력칸에 붙여넣고 저장합니다.</div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">자동 번역 엔진</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          번역 품질과 처리 비용에 맞는 OpenAI 모델을 선택합니다. 자동 번역 버튼을 눌렀을 때만 API가 호출됩니다.
        </p>

        <div className="mt-5 max-w-md">
          <div className="text-xs text-discord-muted mb-2">사용 모델</div>
          <Select
            value={config?.translationModel || OPENAI_TRANSLATION_MODEL}
            onValueChange={(value) => void handleTranslationModelChange(value)}
            disabled={!config || isSaving}
          >
            <SelectTrigger className="border-gray-600 bg-discord-bg text-discord-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-gray-700 bg-discord-sidebar text-discord-text">
              {OPENAI_TRANSLATION_MODELS.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-3 text-xs leading-5 text-discord-muted">
            {OPENAI_TRANSLATION_MODELS.find(
              (model) => model.value === (config?.translationModel || OPENAI_TRANSLATION_MODEL)
            )?.description}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">기본 번역 언어</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          원문 언어는 자동으로 감지하고, 여기서 선택한 언어로 번역합니다.
        </p>

        <div className="mt-5 max-w-md">
          <div className="text-xs text-discord-muted mb-2">대상 언어</div>
          <Select
            value={config?.translationTargetLanguage || 'ko'}
            onValueChange={(value) => void handleTranslationTargetLanguageChange(value)}
            disabled={!config || isSaving}
          >
            <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600 text-discord-text">
              {translationLanguageOptions.map((language) => (
                <SelectItem
                  key={language.value}
                  value={language.value}
                  className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
                >
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">번역 텍스트 표시</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          리스트와 레코드 상세에서 번역문을 어떻게 볼지 선택합니다.
        </p>

        <div className="mt-5 max-w-md">
          <div className="text-xs text-discord-muted mb-2">표시 방식</div>
          <Select
            value={config?.translationDisplayMode === 'inline-hover' ? 'inline-hover' : DEFAULT_TRANSLATION_DISPLAY_MODE}
            onValueChange={(value: TranslationDisplayMode) => void handleTranslationDisplayModeChange(value)}
            disabled={!config || isSaving}
          >
            <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600 text-discord-text">
              <SelectItem
                value="tooltip"
                className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
              >
                호버 시 툴팁으로 출력
              </SelectItem>
              <SelectItem
                value="inline-hover"
                className="text-discord-text focus:bg-discord-hover focus:text-discord-text hover:bg-discord-hover"
              >
                호버 시 번역 대상 텍스트 대신 번역 텍스트 출력
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">OpenAI API 키</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          키는 이 앱의 로컬 환경설정에 저장됩니다. 저장된 키가 있더라도 보안상 이 화면에는 다시 표시하지 않습니다.
        </p>

        {!config?.hasOpenAiApiKey && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            OpenAI API 키가 등록되지 않아 자동 번역을 사용할 수 없습니다. 아래 입력칸에 API 키를 저장한 뒤 자동 번역 버튼을 사용할 수 있습니다.
          </div>
        )}

        <div className="mt-3 text-xs text-discord-muted">
          저장 상태: {config?.hasOpenAiApiKey ? '저장됨' : '미설정'}
        </div>

        <div className="mt-5 grid gap-3 max-w-xl">
          <Input
            type="password"
            value={translationApiKeyInput}
            onChange={(e) => {
              setTranslationApiKeyInput(e.target.value);
              setTranslationMessage('');
            }}
            placeholder={config?.hasOpenAiApiKey ? '새 OpenAI API 키 입력' : 'OpenAI API 키 입력'}
            className="bg-discord-bg border-gray-600 text-discord-text"
          />

          {translationMessage && <p className="text-sm text-discord-muted">{translationMessage}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={() => void handleSaveOpenAiApiKey()}
              className="bg-discord-accent hover:bg-blue-600 text-white"
              disabled={isSaving}
            >
              {config?.hasOpenAiApiKey ? 'API 키 변경' : 'API 키 저장'}
            </Button>
            {config?.hasOpenAiApiKey && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClearOpenAiApiKey()}
                className="border-gray-600 hover:bg-discord-hover text-discord-text"
                disabled={isSaving}
              >
                API 키 삭제
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderViewerSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">동영상 자동 재생</div>
            <p className="text-sm text-discord-muted mt-2 leading-6">
              동영상 파일 또는 압축파일 안의 동영상을 열었을 때 바로 재생할지 설정합니다.
            </p>
          </div>
          <Switch
            checked={config?.videoAutoPlay !== false}
            onCheckedChange={handleVideoAutoPlayChange}
            disabled={!config || isSaving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>

        {viewerAutoPlayMessage && (
          <p className="text-sm text-discord-muted mt-2">{viewerAutoPlayMessage}</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">동영상 좌우키 이동 간격</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          동영상 재생 중 좌우 방향키를 눌렀을 때 몇 초 단위로 이동할지 설정합니다.
        </p>

        <div className="mt-5 flex items-end gap-3 max-w-md">
          <div className="flex-1">
            <div className="text-xs text-discord-muted mb-2">이동 간격</div>
            <Input
              type="number"
              min="1"
              value={viewerSeekSeconds}
              onChange={(e) => {
                setViewerSeekSeconds(e.target.value);
                setViewerMessage('');
              }}
              className="bg-discord-bg border-gray-600 text-discord-text"
            />
          </div>
          <div className="text-sm text-discord-muted pb-2">초</div>
        </div>

        {viewerMessage && <p className="text-sm text-discord-muted mt-2">{viewerMessage}</p>}
      </div>
    </div>
  );

  const renderShortcutsSection = () => (
    <div className="space-y-4">
      {shortcutSections.map((section) => (
        <div key={section.title} className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
          <div className="text-sm font-medium text-white">{section.title}</div>
          <p className="mt-2 text-sm leading-6 text-discord-muted">{section.description}</p>

          <div className="mt-5 space-y-3">
            {section.items.map((item) => (
              <div
                key={`${section.title}-${item.keys}`}
                className="flex items-start justify-between gap-4 rounded-lg border border-gray-700 bg-discord-bg/70 px-4 py-3"
              >
                <div className="min-w-[160px] shrink-0 rounded-md bg-black/20 px-3 py-1.5 text-xs font-semibold tracking-wide text-blue-300">
                  {item.keys}
                </div>
                <div className="flex-1 text-sm leading-6 text-discord-text">{item.description}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderSecuritySection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">프로그램 비밀번호</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          비밀번호를 설정하면 프로그램을 실행할 때마다 먼저 비밀번호를 입력해야 접근할 수 있습니다.
        </p>

        <div className="mt-5 grid gap-3 max-w-md">
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setSecurityMessage('');
            }}
            placeholder={config?.hasAppPassword ? '새 비밀번호' : '비밀번호'}
            className="bg-discord-bg border-gray-600 text-discord-text"
          />
          <Input
            type="password"
            value={passwordConfirm}
            onChange={(e) => {
              setPasswordConfirm(e.target.value);
              setSecurityMessage('');
            }}
            placeholder="비밀번호 확인"
            className="bg-discord-bg border-gray-600 text-discord-text"
          />

          {securityMessage && <p className="text-sm text-discord-muted">{securityMessage}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={() => void handleSavePassword()}
              className="bg-discord-accent hover:bg-blue-600 text-white"
              disabled={isSaving}
            >
              {config?.hasAppPassword ? '비밀번호 변경' : '비밀번호 설정'}
            </Button>
            {config?.hasAppPassword && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClearPassword()}
                className="border-gray-600 hover:bg-discord-hover text-discord-text"
                disabled={isSaving}
              >
                비밀번호 해제
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">로그인 잠금</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          비밀번호를 연속으로 틀리면 설정한 시간 동안 비밀번호 입력을 잠급니다. 앱을 다시 실행해도 잠금은 유지됩니다.
        </p>

        <div className="mt-5 grid max-w-md gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-discord-text" htmlFor="password-lock-attempts">최대 실패 횟수</label>
            <div className="flex items-center gap-2">
              <Input
                id="password-lock-attempts"
                type="number"
                min="1"
                max="20"
                step="1"
                value={passwordLockAttempts}
                onChange={(e) => {
                  setPasswordLockAttempts(e.target.value);
                  setPasswordLockMessage('');
                }}
                className="bg-discord-bg border-gray-600 text-discord-text"
              />
              <span className="text-sm text-discord-muted">회</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-discord-text" htmlFor="password-lock-minutes">잠금 시간</label>
            <div className="flex items-center gap-2">
              <Input
                id="password-lock-minutes"
                type="number"
                min="1"
                max="1440"
                step="1"
                value={passwordLockMinutes}
                onChange={(e) => {
                  setPasswordLockMinutes(e.target.value);
                  setPasswordLockMessage('');
                }}
                className="bg-discord-bg border-gray-600 text-discord-text"
              />
              <span className="text-sm text-discord-muted">분</span>
            </div>
          </div>
        </div>

        {passwordLockMessage && <p className="mt-3 text-sm text-discord-muted">{passwordLockMessage}</p>}

        <Button
          type="button"
          onClick={() => void handleSavePasswordLockSettings()}
          className="mt-5 bg-discord-accent hover:bg-blue-600 text-white"
          disabled={isSaving}
        >
          로그인 잠금 설정 저장
        </Button>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">자리 비움 시 자동 잠금</div>
            <p className="mt-2 text-sm leading-6 text-discord-muted">
              마우스나 키보드 입력이 없으면 잠금 화면으로 돌아갑니다. 창이 활성화된 채로 영상을 보고 있으면 잠기지 않습니다.
            </p>
          </div>
          <Switch
            checked={(config?.idleLockMinutes ?? 0) > 0 && Boolean(config?.hasAppPassword)}
            onCheckedChange={(checked) => void handleIdleLockEnabledChange(checked)}
            disabled={!config || isSaving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>

        <div className="mt-5 max-w-md space-y-2">
          <label className="text-sm text-discord-text" htmlFor="idle-lock-minutes">자리 비움 시간</label>
          <div className="flex items-center gap-2">
            <Input
              id="idle-lock-minutes"
              type="number"
              min="1"
              max="1440"
              step="1"
              value={idleLockMinutesInput}
              onChange={(e) => {
                setIdleLockMinutesInput(e.target.value);
                setIdleLockMessage('');
              }}
              disabled={!config || isSaving || (config?.idleLockMinutes ?? 0) <= 0}
              className="bg-discord-bg border-gray-600 text-discord-text"
            />
            <span className="text-sm text-discord-muted">분</span>
          </div>
        </div>

        {idleLockMessage && <p className="mt-3 text-sm text-discord-muted">{idleLockMessage}</p>}

        <Button
          type="button"
          onClick={() => void handleSaveIdleLockMinutes()}
          className="mt-5 bg-discord-accent hover:bg-blue-600 text-white"
          disabled={isSaving || (config?.idleLockMinutes ?? 0) <= 0}
        >
          자리 비움 시간 저장
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(1400px,96vw)] h-[88vh] p-0 gap-0 bg-discord-bg border-gray-700 text-discord-text overflow-hidden [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">환경설정</DialogTitle>

        <div className="flex h-full min-h-0">
          <aside className="w-[280px] shrink-0 border-r border-gray-700 bg-discord-sidebar">
            <div className="px-5 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-white">환경설정</h2>
            </div>

            <nav className="p-3 space-y-1">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                const isActive = currentSection.id === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                      isActive
                        ? 'bg-discord-hover text-white border border-gray-700'
                        : 'text-discord-muted border border-transparent hover:bg-discord-hover hover:text-discord-text'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 ${isActive ? 'text-blue-400' : ''}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{section.label}</div>
                      <div className="text-xs text-gray-400 mt-1">{section.description}</div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="flex-1 min-w-0 flex flex-col">
            <header className="flex items-center justify-between px-6 py-5 border-b border-gray-700 bg-discord-bg">
              <div>
                <h3 className="text-lg font-semibold text-white">{currentSection.label}</h3>
                <p className="text-sm text-discord-muted mt-1">{currentSection.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-discord-muted hover:text-discord-text"
                aria-label="환경설정 닫기"
              >
                <X size={24} />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-discord-bg">
              {currentSection.id === 'general'
                ? renderGeneralSection()
                : currentSection.id === 'data'
                  ? renderDataSection()
                : currentSection.id === 'translation'
                  ? renderTranslationSection()
                  : currentSection.id === 'list'
                  ? renderListSection()
                  : currentSection.id === 'viewer'
                    ? renderViewerSection()
                    : currentSection.id === 'shortcuts'
                      ? renderShortcutsSection()
                      : renderSecuritySection()}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
