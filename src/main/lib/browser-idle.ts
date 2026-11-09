export const PLAYING_MEDIA_SCRIPT = `(() => {
  try {
    const pip = document.pictureInPictureElement;
    if (pip && pip.paused === false && pip.ended === false) return true;
    return Array.from(document.querySelectorAll('video, audio')).some((el) => (
      el.paused === false && el.ended === false
    ));
  } catch {
    return false;
  }
})()`;

const IDLE_ACTIVITY_INPUT_TYPES = new Set([
  'mouseDown',
  'mouseMove',
  'mouseWheel',
  'keyDown',
  'rawKeyDown',
  'touchStart',
  'touchMove',
  'gestureScrollUpdate',
  'gesturePinchUpdate',
]);

export function isIdleActivityInputType(type) {
  return IDLE_ACTIVITY_INPUT_TYPES.has(String(type || ''));
}

export function createBrowserIdleTracker({ now = () => Date.now() } = {}) {
  let lastActivityAt = 0;

  return {
    markActivity() {
      lastActivityAt = now();
    },
    reset() {
      lastActivityAt = 0;
    },
    getLastActivityAt() {
      return lastActivityAt;
    },
    handleInputEvent(type) {
      if (isIdleActivityInputType(type)) {
        lastActivityAt = now();
      }
    },
  };
}

export function raceWithTimeout(promise, timeoutMs, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
