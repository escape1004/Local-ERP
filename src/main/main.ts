import { app, BrowserWindow } from 'electron';

if (process.platform === 'win32') {
  app.setAppUserModelId('com.escape.local-erp');
}

app.commandLine.appendSwitch(
  'disable-features',
  'TrackingProtection3pcd,ThirdPartyStoragePartitioning',
);

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let handleSecondInstance = () => {
    const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (!window) return;
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    window.focus();
  };

  app.on('second-instance', () => {
    handleSecondInstance();
  });

  void import('./start').then(({ focusExistingInstance, startMainApp }) => {
    handleSecondInstance = focusExistingInstance;
    startMainApp();
  });
}
