export type BrowserIdleState = {
  focused: boolean;
  lastActivityAt: number;
  hasPlayingMedia: boolean;
};

export function nextIdleActivityAt(
  currentActivityAt: number,
  now: number,
  options: {
    hasFocusedMediaPlayback: boolean;
    browser?: Pick<BrowserIdleState, 'focused' | 'lastActivityAt' | 'hasPlayingMedia'> | null;
  },
) {
  if (options.hasFocusedMediaPlayback || (options.browser?.focused && options.browser.hasPlayingMedia)) {
    return { activityAt: now, keepAwake: true };
  }

  return {
    activityAt: Math.max(currentActivityAt, options.browser?.lastActivityAt ?? 0),
    keepAwake: false,
  };
}

export function shouldIdleLock(activityAt: number, now: number, idleLockMinutes: number) {
  if (idleLockMinutes <= 0) return false;
  return now - activityAt >= idleLockMinutes * 60 * 1000;
}

export function hasFocusedMediaPlayback() {
  if (!document.hasFocus()) return false;

  return Array.from(document.querySelectorAll('video, audio')).some((element) => {
    const media = element as HTMLMediaElement;
    return !media.paused && !media.ended;
  });
}

export async function silenceAppForLock() {
  document.querySelectorAll('video, audio').forEach((element) => {
    (element as HTMLMediaElement).pause();
  });

  if (document.pictureInPictureElement) {
    try {
      await document.exitPictureInPicture();
    } catch {
      // Picture-in-picture may already have been closed.
    }
  }

  try {
    await window.electronAPI.setPictureInPictureActive(false);
  } catch {
    // Ignore IPC failures while locking.
  }
}
