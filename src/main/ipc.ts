import { statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';

import {
  IPC_CHANNELS,
  type BootstrapState,
  type ChooseLibraryRootResult,
  type DatabaseBackupResult,
  type DatabaseRestoreResult,
  type ScanLibraryResult,
  type StartVideoRenderResult,
} from '../shared/contracts';
import { parseVideoViewCount } from '../shared/video-view-count';
import type { AppDatabase } from './database';
import { resolveLibraryFilePath, type ThumbnailCache } from './thumbnail-cache';
import {
  parseVideoEditorPresetId,
  parseVideoEditorPresetInput,
  parseVideoEditorTextPresetId,
  parseVideoEditorTextPresetInput,
  parseVideoRenderJobId,
  parseVideoRenderRequest,
} from './video-editor';
import { getLibraryVideoPage, parseVideoReaction } from './video-library';
import {
  parseContentHash,
  parseOptionalContentHash,
  parseVideoMetadataInput,
  parseVideoMetadataSearchQuery,
} from './video-metadata';
import { scanVideoDirectory } from './video-scanner';
import { parseVideoTagId, parseVideoTagIds, parseVideoTagName } from './video-tags';
import { resolveVideoPlaybackPath } from './video-playback';
import { VideoRenderManager } from './video-renderer';
import {
  parseGeneratedVideoCaption,
  parseGeneratedVideoScreenText,
  parseVideoCaptionCopywritingType,
  parseVideoCaptionGenerationRequest,
  parseVideoCaptionTargetLanguage,
  parseVideoCaptionVariationId,
} from './video-caption';
import type { VideoCaptionGenerator } from './codex-caption-generator';

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

function backupFileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function pathsMatch(firstPath: string, secondPath: string): boolean {
  const first = resolve(firstPath);
  const second = resolve(secondPath);
  return process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase()
    : first === second;
}

export function registerIpcHandlers(
  database: AppDatabase,
  thumbnailCache: ThumbnailCache,
  videoCaptionGenerator: VideoCaptionGenerator,
): () => void {
  const videoRenderManager = new VideoRenderManager();
  ipcMain.handle(IPC_CHANNELS.getBootstrapState, () => buildBootstrapState(database));

  ipcMain.handle(IPC_CHANNELS.createDatabaseBackup, async (): Promise<DatabaseBackupResult> => {
    const parentWindow = BrowserWindow.getFocusedWindow();
    const options: SaveDialogOptions = {
      title: '데이터베이스 백업 저장',
      buttonLabel: '백업 저장',
      defaultPath: join(
        app.getPath('documents'),
        `local-video-manager-backup-${backupFileTimestamp()}.sqlite`,
      ),
      filters: [{ name: 'Local Video Manager 백업', extensions: ['sqlite'] }],
    };
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return { cancelled: true, filePath: null };
    }

    await database.createBackup(result.filePath, app.getVersion());
    return { cancelled: false, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.restoreDatabaseBackup, async (): Promise<DatabaseRestoreResult> => {
    const parentWindow = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: '데이터베이스 백업 선택',
      buttonLabel: '백업 선택',
      filters: [{ name: 'Local Video Manager 백업', extensions: ['sqlite'] }],
      properties: ['openFile'],
    };
    const selected = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);
    const sourcePath = selected.filePaths[0];
    if (selected.canceled || !sourcePath) {
      return { automaticBackupPath: null, cancelled: true };
    }

    const confirmationOptions = {
      type: 'warning' as const,
      title: '데이터베이스 복원',
      message: '선택한 백업으로 현재 데이터를 복원하시겠습니까?',
      detail:
        '현재 DB는 자동으로 별도 보존됩니다. 영상 원본 파일은 변경되지 않으며 복원 후 앱이 재시작됩니다.',
      buttons: ['취소', '복원'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const confirmation = parentWindow
      ? await dialog.showMessageBox(parentWindow, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions);
    if (confirmation.response !== 1) {
      return { automaticBackupPath: null, cancelled: true };
    }

    const userDataPath = app.getPath('userData');
    const automaticBackupPath = join(
      userDataPath,
      'backups',
      `before-restore-${backupFileTimestamp()}.sqlite`,
    );
    const pendingRestorePath = join(userDataPath, 'pending-database-restore.sqlite');
    await database.stageBackupRestore(
      sourcePath,
      pendingRestorePath,
      automaticBackupPath,
      app.getVersion(),
    );

    const completedOptions = {
      type: 'info' as const,
      title: '복원 준비 완료',
      message: '백업 복원을 위해 앱을 재시작합니다.',
      detail: `복원 직전 DB 보존 위치:\n${automaticBackupPath}`,
      buttons: ['재시작'],
      defaultId: 0,
      noLink: true,
    };
    if (parentWindow) {
      await dialog.showMessageBox(parentWindow, completedOptions);
    } else {
      await dialog.showMessageBox(completedOptions);
    }

    app.relaunch();
    app.quit();
    return { automaticBackupPath, cancelled: false };
  });

  ipcMain.handle(IPC_CHANNELS.getLibraryVideoPage, (_event, pageIndex: unknown, query: unknown) =>
    getLibraryVideoPage(database, thumbnailCache, pageIndex, query),
  );

  ipcMain.handle(IPC_CHANNELS.openVideoSourceUrl, async (_event, contentHash: unknown) => {
    const video = database.getLibraryVideoByHash(parseContentHash(contentHash));
    if (!video?.sourceUrl) {
      throw new Error('The video does not have a source URL.');
    }

    const { sourceUrl } = parseVideoMetadataInput({
      sourceCaption: null,
      sourceUrl: video.sourceUrl,
    });
    if (!sourceUrl) {
      throw new Error('The video does not have a source URL.');
    }

    await shell.openExternal(sourceUrl);
  });

  ipcMain.handle(IPC_CHANNELS.revealVideoFile, (_event, contentHash: unknown) => {
    const libraryRoot = database.getLibraryRoot();
    const video = database.getLibraryVideoByHash(parseContentHash(contentHash));
    const filePath =
      libraryRoot && video ? resolveLibraryFilePath(libraryRoot, video.relativePath) : null;
    if (!filePath) {
      throw new Error('The video file location is not available.');
    }

    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.getTags, () => database.getTags());

  ipcMain.handle(IPC_CHANNELS.createTag, (_event, name: unknown) =>
    database.createVideoTag(parseVideoTagName(name)),
  );

  ipcMain.handle(IPC_CHANNELS.renameTag, (_event, tagId: unknown, name: unknown) =>
    database.renameVideoTag(parseVideoTagId(tagId), parseVideoTagName(name)),
  );

  ipcMain.handle(IPC_CHANNELS.deleteTag, (_event, tagId: unknown) =>
    database.deleteVideoTag(parseVideoTagId(tagId)),
  );

  ipcMain.handle(IPC_CHANNELS.setVideoTags, (_event, contentHash: unknown, tagIds: unknown) =>
    database.setVideoTags(parseContentHash(contentHash), parseVideoTagIds(tagIds)),
  );

  ipcMain.handle(IPC_CHANNELS.setVideoReaction, (_event, contentHash: unknown, reaction: unknown) =>
    database.setVideoReaction(parseContentHash(contentHash), parseVideoReaction(reaction)),
  );

  ipcMain.handle(
    IPC_CHANNELS.setVideoViewCount,
    (_event, contentHash: unknown, viewCount: unknown) =>
      database.setVideoViewCount(parseContentHash(contentHash), parseVideoViewCount(viewCount)),
  );

  ipcMain.handle(IPC_CHANNELS.getVideoMetadata, (_event, contentHash: unknown) =>
    database.getVideoMetadata(parseContentHash(contentHash)),
  );

  ipcMain.handle(IPC_CHANNELS.getVideoCaptionDrafts, (_event, contentHash: unknown) =>
    database.getVideoCaptionDrafts(parseContentHash(contentHash)),
  );

  ipcMain.handle(IPC_CHANNELS.generateVideoCaption, (_event, request: unknown) =>
    videoCaptionGenerator.generate(parseVideoCaptionGenerationRequest(request)),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveVideoCaptionDraft,
    (
      _event,
      contentHash: unknown,
      targetLanguage: unknown,
      variationId: unknown,
      copywritingType: unknown,
      topText: unknown,
      bottomText: unknown,
      caption: unknown,
    ) =>
      database.saveVideoCaptionDraft(
        parseContentHash(contentHash),
        parseVideoCaptionTargetLanguage(targetLanguage),
        parseVideoCaptionVariationId(variationId),
        parseVideoCaptionCopywritingType(copywritingType),
        parseGeneratedVideoScreenText(topText),
        parseGeneratedVideoScreenText(bottomText),
        parseGeneratedVideoCaption(caption),
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.searchVideoMetadata,
    async (_event, query: unknown, excludeContentHash: unknown) => {
      const results = database.searchVideoMetadata(
        parseVideoMetadataSearchQuery(query),
        parseContentHash(excludeContentHash),
      );

      return Promise.all(
        results.map(async (result) => ({
          ...result,
          thumbnailDataUrl: await thumbnailCache.getCachedThumbnailDataUrl(result.contentHash),
        })),
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.saveVideoMetadata,
    (_event, contentHash: unknown, input: unknown, copiedFromContentHash: unknown) =>
      database.saveVideoMetadata(
        parseContentHash(contentHash),
        parseVideoMetadataInput(input),
        parseOptionalContentHash(copiedFromContentHash),
      ),
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

  ipcMain.handle(IPC_CHANNELS.getVideoEditorPresets, () => database.getVideoEditorPresets());

  ipcMain.handle(IPC_CHANNELS.createVideoEditorPreset, (_event, input: unknown) =>
    database.createVideoEditorPreset(parseVideoEditorPresetInput(input)),
  );

  ipcMain.handle(
    IPC_CHANNELS.updateVideoEditorPreset,
    (_event, presetId: unknown, input: unknown) =>
      database.updateVideoEditorPreset(
        parseVideoEditorPresetId(presetId),
        parseVideoEditorPresetInput(input),
      ),
  );

  ipcMain.handle(IPC_CHANNELS.deleteVideoEditorPreset, (_event, presetId: unknown) =>
    database.deleteVideoEditorPreset(parseVideoEditorPresetId(presetId)),
  );

  ipcMain.handle(IPC_CHANNELS.getVideoEditorTextPresets, () =>
    database.getVideoEditorTextPresets(),
  );

  ipcMain.handle(IPC_CHANNELS.createVideoEditorTextPreset, (_event, input: unknown) =>
    database.createVideoEditorTextPreset(parseVideoEditorTextPresetInput(input)),
  );

  ipcMain.handle(
    IPC_CHANNELS.updateVideoEditorTextPreset,
    (_event, presetId: unknown, input: unknown) =>
      database.updateVideoEditorTextPreset(
        parseVideoEditorTextPresetId(presetId),
        parseVideoEditorTextPresetInput(input),
      ),
  );

  ipcMain.handle(IPC_CHANNELS.deleteVideoEditorTextPreset, (_event, presetId: unknown) =>
    database.deleteVideoEditorTextPreset(parseVideoEditorTextPresetId(presetId)),
  );

  ipcMain.handle(
    IPC_CHANNELS.startVideoRender,
    async (event, contentHash: unknown, requestValue: unknown): Promise<StartVideoRenderResult> => {
      const parsedContentHash = parseContentHash(contentHash);
      const request = parseVideoRenderRequest(requestValue);
      const sourcePath = await resolveVideoPlaybackPath(database, parsedContentHash);
      if (!sourcePath) {
        throw new Error('The source video is not available.');
      }

      const sourceExtension = extname(sourcePath);
      const defaultOutputPath = join(
        dirname(sourcePath),
        `${basename(sourcePath, sourceExtension)}-edited.mp4`,
      );
      const parentWindow = BrowserWindow.getFocusedWindow();
      const options: SaveDialogOptions = {
        title: '편집 영상 저장',
        buttonLabel: '영상 만들기',
        defaultPath: defaultOutputPath,
        filters: [{ name: 'MP4 영상', extensions: ['mp4'] }],
      };
      const selected = parentWindow
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options);
      if (selected.canceled || !selected.filePath) {
        return { cancelled: true, jobId: null, outputPath: null };
      }
      if (pathsMatch(sourcePath, selected.filePath)) {
        throw new Error('The edited video cannot overwrite its source file.');
      }

      const outputPath = selected.filePath;
      const jobId = videoRenderManager.start(sourcePath, outputPath, request, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.videoRenderProgress, progress);
        }
      });
      return { cancelled: false, jobId, outputPath };
    },
  );

  ipcMain.handle(IPC_CHANNELS.cancelVideoRender, (_event, jobId: unknown) =>
    videoRenderManager.cancel(parseVideoRenderJobId(jobId)),
  );

  ipcMain.handle(IPC_CHANNELS.revealRenderedVideo, (_event, jobId: unknown) => {
    shell.showItemInFolder(videoRenderManager.getCompletedOutput(parseVideoRenderJobId(jobId)));
  });

  return () => {
    videoRenderManager.dispose();
    ipcMain.removeHandler(IPC_CHANNELS.getBootstrapState);
    ipcMain.removeHandler(IPC_CHANNELS.createDatabaseBackup);
    ipcMain.removeHandler(IPC_CHANNELS.restoreDatabaseBackup);
    ipcMain.removeHandler(IPC_CHANNELS.chooseLibraryRoot);
    ipcMain.removeHandler(IPC_CHANNELS.getLibraryVideoPage);
    ipcMain.removeHandler(IPC_CHANNELS.openVideoSourceUrl);
    ipcMain.removeHandler(IPC_CHANNELS.revealVideoFile);
    ipcMain.removeHandler(IPC_CHANNELS.getTags);
    ipcMain.removeHandler(IPC_CHANNELS.createTag);
    ipcMain.removeHandler(IPC_CHANNELS.renameTag);
    ipcMain.removeHandler(IPC_CHANNELS.deleteTag);
    ipcMain.removeHandler(IPC_CHANNELS.setVideoTags);
    ipcMain.removeHandler(IPC_CHANNELS.setVideoReaction);
    ipcMain.removeHandler(IPC_CHANNELS.setVideoViewCount);
    ipcMain.removeHandler(IPC_CHANNELS.getVideoMetadata);
    ipcMain.removeHandler(IPC_CHANNELS.getVideoCaptionDrafts);
    ipcMain.removeHandler(IPC_CHANNELS.generateVideoCaption);
    ipcMain.removeHandler(IPC_CHANNELS.saveVideoCaptionDraft);
    ipcMain.removeHandler(IPC_CHANNELS.searchVideoMetadata);
    ipcMain.removeHandler(IPC_CHANNELS.saveVideoMetadata);
    ipcMain.removeHandler(IPC_CHANNELS.scanLibrary);
    ipcMain.removeHandler(IPC_CHANNELS.getVideoEditorPresets);
    ipcMain.removeHandler(IPC_CHANNELS.createVideoEditorPreset);
    ipcMain.removeHandler(IPC_CHANNELS.updateVideoEditorPreset);
    ipcMain.removeHandler(IPC_CHANNELS.deleteVideoEditorPreset);
    ipcMain.removeHandler(IPC_CHANNELS.getVideoEditorTextPresets);
    ipcMain.removeHandler(IPC_CHANNELS.createVideoEditorTextPreset);
    ipcMain.removeHandler(IPC_CHANNELS.updateVideoEditorTextPreset);
    ipcMain.removeHandler(IPC_CHANNELS.deleteVideoEditorTextPreset);
    ipcMain.removeHandler(IPC_CHANNELS.startVideoRender);
    ipcMain.removeHandler(IPC_CHANNELS.cancelVideoRender);
    ipcMain.removeHandler(IPC_CHANNELS.revealRenderedVideo);
  };
}
