import { stat } from 'node:fs/promises';

import type { LibraryVideoItem, LibraryVideoPage } from '../shared/contracts';
import type { AppDatabase } from './database';
import { resolveLibraryFilePath, type ThumbnailCache } from './thumbnail-cache';
import { buildVideoPlaybackUrl } from './video-playback';

const VIDEO_PAGE_SIZE = 24;

async function isFileAvailable(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function getLibraryVideoPage(
  database: AppDatabase,
  thumbnailCache: ThumbnailCache,
  pageIndex: number,
): Promise<LibraryVideoPage> {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
    throw new Error('Invalid video page index.');
  }

  const libraryRoot = database.getLibraryRoot();
  const totalItems = database.getLibraryStats().uniqueVideoCount;
  const videos = database.getLibraryVideos(VIDEO_PAGE_SIZE, pageIndex * VIDEO_PAGE_SIZE);
  const items: LibraryVideoItem[] = [];

  for (const video of videos) {
    const absolutePath = libraryRoot
      ? resolveLibraryFilePath(libraryRoot, video.relativePath)
      : null;
    const fileAvailable = absolutePath ? await isFileAvailable(absolutePath) : false;
    let thumbnailDataUrl: string | null = null;

    if (fileAvailable && absolutePath) {
      try {
        thumbnailDataUrl = await thumbnailCache.getThumbnailDataUrl(
          video.contentHash,
          absolutePath,
        );
      } catch {
        thumbnailDataUrl = null;
      }
    }

    items.push({
      ...video,
      fileAvailable,
      playbackUrl: fileAvailable ? buildVideoPlaybackUrl(video.contentHash) : null,
      thumbnailDataUrl,
    });
  }

  return {
    items,
    pageIndex,
    pageSize: VIDEO_PAGE_SIZE,
    totalItems,
    totalPages: Math.ceil(totalItems / VIDEO_PAGE_SIZE),
  };
}
