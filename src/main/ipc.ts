import { statSync } from 'node:fs';

import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';

import {
  IPC_CHANNELS,
  type BootstrapState,
  type ChooseLibraryRootResult,
  type ScanLibraryResult,
} from '../shared/contracts';
import type { AppDatabase } from './database';
import type { ThumbnailCache } from './thumbnail-cache';
import { getLibraryVideoPage } from './video-library';
import { parseContentHash, parseVideoMetadataInput } from './video-metadata';
import { scanVideoDirectory } from './video-scanner';

function isDirectoryAvailable(directoryPath: string | null): boolean {
  if (!directoryPath) {
    return false;
  }

  try {
    return statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function buildBootstrapState(database: AppDatabase): BootstrapState {
  const libraryRoot = database.getLibraryRoot();

  return {
    appVersion: app.getVersion(),
    libraryId: database.getOrCreateLibraryId(),
    libraryRoot,
    libraryRootAvailable: isDirectoryAvailable(libraryRoot),
    libraryStats: database.getLibraryStats(),
    platform: process.platform,
  };
}

export function registerIpcHandlers(
  database: AppDatabase,
  thumbnailCache: ThumbnailCache,
): () => void {
  ipcMain.handle(IPC_CHANNELS.getBootstrapState, () => buildBootstrapState(database));

  ipcMain.handle(IPC_CHANNELS.getLibraryVideoPage, (_event, pageIndex: unknown) =>
    getLibraryVideoPage(database, thumbnailCache, pageIndex as number),
  );

  ipcMain.handle(IPC_CHANNELS.getVideoMetadata, (_event, contentHash: unknown) =>
    database.getVideoMetadata(parseContentHash(contentHash)),
  );

  ipcMain.handle(IPC_CHANNELS.saveVideoMetadata, (_event, contentHash: unknown, input: unknown) =>
    database.saveVideoMetadata(parseContentHash(contentHash), parseVideoMetadataInput(input)),
  );

  ipcMain.handle(IPC_CHANNELS.chooseLibraryRoot, async (): Promise<ChooseLibraryRootResult> => {
    const currentRoot = database.getLibraryRoot();
    const parentWindow = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: '영상 폴더 선택',
      buttonLabel: '이 폴더 사용',
      properties: ['openDirectory', 'createDirectory'],
      ...(currentRoot ? { defaultPath: currentRoot } : {}),
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return {
        cancelled: true,
        state: buildBootstrapState(database),
      };
    }

    database.setLibraryRoot(result.filePaths[0]);
    return {
      cancelled: false,
      state: buildBootstrapState(database),
    };
  });

  ipcMain.handle(IPC_CHANNELS.scanLibrary, async (): Promise<ScanLibraryResult> => {
    const libraryRoot = database.getLibraryRoot();
    if (!isDirectoryAvailable(libraryRoot) || !libraryRoot) {
      throw new Error('The selected library folder is not available.');
    }

    const scan = await scanVideoDirectory(libraryRoot, database.getVideoFileCache());
    const summary = database.syncVideoFiles(scan.files, scan);

    return {
      state: buildBootstrapState(database),
      summary,
    };
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.getBootstrapState);
    ipcMain.removeHandler(IPC_CHANNELS.chooseLibraryRoot);
    ipcMain.removeHandler(IPC_CHANNELS.getLibraryVideoPage);
    ipcMain.removeHandler(IPC_CHANNELS.getVideoMetadata);
    ipcMain.removeHandler(IPC_CHANNELS.saveVideoMetadata);
    ipcMain.removeHandler(IPC_CHANNELS.scanLibrary);
  };
}
