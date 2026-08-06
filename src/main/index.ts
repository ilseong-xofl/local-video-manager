import { join } from 'node:path';

import { app, BrowserWindow, nativeImage } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';

import { AppDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { ThumbnailCache } from './thumbnail-cache';
import { configureAutoUpdates } from './updates';

let database: AppDatabase | null = null;
let removeIpcHandlers: (() => void) | null = null;

async function createSystemThumbnail(videoPath: string): Promise<Buffer | null> {
  const image = await nativeImage.createThumbnailFromPath(videoPath, { width: 480, height: 270 });
  return image.isEmpty() ? null : image.toJPEG(82);
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
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

  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

if (squirrelStartup) {
  app.quit();
} else {
  app.setAppUserModelId('com.localvideomanager.desktop');

  void app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    database = new AppDatabase(join(userDataPath, 'local-video-manager.sqlite'));
    const thumbnailCache = new ThumbnailCache(
      join(userDataPath, 'thumbnails'),
      createSystemThumbnail,
    );
    removeIpcHandlers = registerIpcHandlers(database, thumbnailCache);
    createWindow();

    setTimeout(configureAutoUpdates, 10_000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
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
    database?.close();
    database = null;
  });
}
