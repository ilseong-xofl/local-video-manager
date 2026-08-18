import { join } from 'node:path';

import { app, BrowserWindow, nativeImage, powerMonitor, protocol, safeStorage } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';

import { IPC_CHANNELS, type AppAuthState } from '../shared/contracts';
import { AppDatabase, applyPendingDatabaseRestore } from './database';
import { EncryptedAuthTokenStore } from './auth-token-store';
import { registerIpcHandlers } from './ipc';
import { ServiceApiClient } from './service-api';
import { resolveServiceBaseUrl } from './service-config';
import { ThumbnailCache } from './thumbnail-cache';
import { configureAutoUpdates } from './updates';
import { VIDEO_PROTOCOL_SCHEME } from './video-playback';
import { registerVideoProtocol } from './video-protocol';

let database: AppDatabase | null = null;
let removeIpcHandlers: (() => void) | null = null;
let removeVideoProtocol: (() => void) | null = null;
let removeResumeHandler: (() => void) | null = null;
let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: VIDEO_PROTOCOL_SCHEME,
    privileges: { secure: true, standard: true, stream: true },
  },
]);

async function createSystemThumbnail(videoPath: string): Promise<Buffer | null> {
  const image = await nativeImage.createThumbnailFromPath(videoPath, { width: 480, height: 270 });
  return image.isEmpty() ? null : image.toJPEG(82);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 920,
    minWidth: 1065,
    minHeight: 620,
    show: false,
    backgroundColor: '#f4f5f7',
    title: 'Local Video Manager',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return window;
}

if (squirrelStartup) {
  app.quit();
} else {
  app.setAppUserModelId('com.localvideomanager.desktop');

  void app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    const databasePath = join(userDataPath, 'local-video-manager.sqlite');
    const pendingRestorePath = join(userDataPath, 'pending-database-restore.sqlite');
    try {
      applyPendingDatabaseRestore(databasePath, pendingRestorePath);
    } catch (error) {
      console.error(
        '[database] Pending restore failed; the previous database was preserved.',
        error,
      );
    }
    database = new AppDatabase(databasePath);
    const thumbnailCache = new ThumbnailCache(
      join(userDataPath, 'thumbnails'),
      createSystemThumbnail,
    );
    let serviceBaseUrl: string | null = null;
    let serviceConfigurationError = '서비스 주소가 설정되지 않았습니다.';
    try {
      serviceBaseUrl = resolveServiceBaseUrl(undefined, LVM_SERVICE_URL, app.isPackaged);
    } catch (error) {
      if (error instanceof Error) {
        serviceConfigurationError = error.message;
      }
    }
    const tokenStore = new EncryptedAuthTokenStore(
      join(userDataPath, 'auth', 'session.bin'),
      safeStorage,
    );
    const serviceClient = new ServiceApiClient(
      serviceBaseUrl,
      tokenStore,
      fetch,
      serviceConfigurationError,
    );
    let currentAuthState: AppAuthState | null = null;
    const broadcastAuthState = (state: AppAuthState) => {
      currentAuthState = state;
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.authStateChanged, state);
        }
      }
    };
    removeVideoProtocol = registerVideoProtocol(
      database,
      () => currentAuthState?.status === 'authenticated',
    );
    removeIpcHandlers = registerIpcHandlers(
      database,
      thumbnailCache,
      serviceClient,
      broadcastAuthState,
    );
    createWindow();

    const handleResume = () => {
      void serviceClient.getAuthState().then(broadcastAuthState);
    };
    powerMonitor.on('resume', handleResume);
    removeResumeHandler = () => powerMonitor.removeListener('resume', handleResume);

    setTimeout(configureAutoUpdates, 10_000);

    app.on('activate', () => {
      if (!mainWindow) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    removeIpcHandlers?.();
    removeIpcHandlers = null;
    removeVideoProtocol?.();
    removeVideoProtocol = null;
    removeResumeHandler?.();
    removeResumeHandler = null;
    database?.close();
    database = null;
    mainWindow = null;
  });
}
