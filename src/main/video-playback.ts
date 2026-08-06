import { stat } from 'node:fs/promises';

import type { AppDatabase } from './database';
import { resolveLibraryFilePath } from './thumbnail-cache';

export const VIDEO_PROTOCOL_SCHEME = 'local-video';

const VIDEO_PROTOCOL_HOST = 'media';
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function buildVideoPlaybackUrl(contentHash: string): string {
  if (!CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new Error('Invalid video content hash.');
  }

  return `${VIDEO_PROTOCOL_SCHEME}://${VIDEO_PROTOCOL_HOST}/${contentHash}`;
}

export function parseVideoPlaybackUrl(playbackUrl: string): string | null {
  try {
    const url = new URL(playbackUrl);
    const contentHash = url.pathname.slice(1);

    if (
      url.protocol !== `${VIDEO_PROTOCOL_SCHEME}:` ||
      url.hostname !== VIDEO_PROTOCOL_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !CONTENT_HASH_PATTERN.test(contentHash)
    ) {
      return null;
    }

    return contentHash;
  } catch {
    return null;
  }
}

export async function resolveVideoPlaybackPath(
  database: AppDatabase,
  contentHash: string,
): Promise<string | null> {
  if (!CONTENT_HASH_PATTERN.test(contentHash)) {
    return null;
  }

  const libraryRoot = database.getLibraryRoot();
  const video = database.getLibraryVideoByHash(contentHash);
  if (!libraryRoot || !video) {
    return null;
  }

  const absolutePath = resolveLibraryFilePath(libraryRoot, video.relativePath);
  if (!absolutePath) {
    return null;
  }

  try {
    return (await stat(absolutePath)).isFile() ? absolutePath : null;
  } catch {
    return null;
  }
}
