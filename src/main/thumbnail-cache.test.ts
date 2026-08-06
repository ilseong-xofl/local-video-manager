import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLibraryFilePath, ThumbnailCache } from './thumbnail-cache';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-thumbnail-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ThumbnailCache', () => {
  it('creates one JPEG data URL and reuses the cached file', async () => {
    const cacheDirectory = createTemporaryDirectory();
    const createThumbnail = vi.fn(async () => Buffer.from('thumbnail'));
    const cache = new ThumbnailCache(cacheDirectory, createThumbnail);
    const contentHash = 'a'.repeat(64);

    const firstResult = await cache.getThumbnailDataUrl(contentHash, '/videos/first.mp4');
    const secondResult = await cache.getThumbnailDataUrl(contentHash, '/videos/first.mp4');

    expect(firstResult).toBe(
      `data:image/jpeg;base64,${Buffer.from('thumbnail').toString('base64')}`,
    );
    expect(secondResult).toBe(firstResult);
    expect(createThumbnail).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid cache keys', async () => {
    const cache = new ThumbnailCache(createTemporaryDirectory(), async () => Buffer.from('image'));

    await expect(cache.getThumbnailDataUrl('../outside', '/videos/first.mp4')).rejects.toThrow(
      'Invalid video content hash.',
    );
  });
});

describe('resolveLibraryFilePath', () => {
  it('allows descendants of the selected root and rejects traversal', () => {
    const rootPath = createTemporaryDirectory();

    expect(resolveLibraryFilePath(rootPath, 'nested/video.mp4')).toBe(
      join(rootPath, 'nested', 'video.mp4'),
    );
    expect(resolveLibraryFilePath(rootPath, '../outside.mp4')).toBeNull();
  });
});
