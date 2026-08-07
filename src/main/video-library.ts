import { stat } from 'node:fs/promises';

import {
  VIDEO_LIBRARY_SEARCH_MAX_LENGTH,
  type LibraryVideoItem,
  type LibraryVideoPage,
  type LibraryVideoQuery,
  type VideoReaction,
} from '../shared/contracts';
import type { AppDatabase } from './database';
import { resolveLibraryFilePath, type ThumbnailCache } from './thumbnail-cache';
import { buildVideoPlaybackUrl } from './video-playback';

const VIDEO_PAGE_SIZE = 24;

function isValidDateMs(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    !Number.isNaN(new Date(Number(value)).getTime())
  );
}

export function parseLibraryVideoQuery(value: unknown): LibraryVideoQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid video library query.');
  }

  const query = value as Record<string, unknown>;
  if (
    typeof query.searchQuery !== 'string' ||
    query.searchQuery.length > VIDEO_LIBRARY_SEARCH_MAX_LENGTH ||
    (query.reaction !== null &&
      query.reaction !== 'hype' &&
      query.reaction !== 'unhype' &&
      query.reaction !== 'none') ||
    (query.sortField !== 'registeredAt' && query.sortField !== 'modifiedAt') ||
    (query.sortDirection !== 'asc' && query.sortDirection !== 'desc') ||
    (query.tagId !== null &&
      (typeof query.tagId !== 'number' ||
        !Number.isSafeInteger(query.tagId) ||
        query.tagId <= 0)) ||
    !isValidDateMs(query.dateFromMs) ||
    !isValidDateMs(query.dateToMs) ||
    query.dateFromMs > query.dateToMs
  ) {
    throw new Error('Invalid video library query.');
  }

  return {
    dateFromMs: query.dateFromMs,
    dateToMs: query.dateToMs,
    reaction: query.reaction,
    searchQuery: query.searchQuery.trim(),
    sortDirection: query.sortDirection,
    sortField: query.sortField,
    tagId: query.tagId,
  };
}

export function parseVideoReaction(value: unknown): VideoReaction | null {
  if (value === null || value === 'hype' || value === 'unhype') {
    return value;
  }

  throw new Error('Invalid video reaction.');
}

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
  pageIndexValue: unknown,
  queryValue: unknown,
): Promise<LibraryVideoPage> {
  if (
    typeof pageIndexValue !== 'number' ||
    !Number.isSafeInteger(pageIndexValue) ||
    pageIndexValue < 0
  ) {
    throw new Error('Invalid video page index.');
  }

  const pageIndex = pageIndexValue;
  const query = parseLibraryVideoQuery(queryValue);
  const libraryRoot = database.getLibraryRoot();
  const totalItems = database.getLibraryVideoCount(query);
  const videos = database.getLibraryVideos(VIDEO_PAGE_SIZE, pageIndex * VIDEO_PAGE_SIZE, query);
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
      tags: database.getVideoTags(video.contentHash),
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
