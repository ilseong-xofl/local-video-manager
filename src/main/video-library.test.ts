import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppDatabase } from './database';
import { ThumbnailCache } from './thumbnail-cache';
import { getLibraryVideoPage, parseLibraryVideoQuery } from './video-library';
import type { ScannedVideoFile } from './video-scanner';

const temporaryDirectories: string[] = [];
const ALL_VIDEOS_QUERY = {
  dateFromMs: 0,
  dateToMs: Date.parse('9999-12-31T23:59:59.999Z'),
  searchQuery: '',
  sortDirection: 'desc',
  sortField: 'registeredAt',
} as const;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-library-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function scannedVideo(relativePath: string, contentHash: string): ScannedVideoFile {
  return {
    contentHash,
    fileName: relativePath.split('/').at(-1) ?? relativePath,
    modifiedAtMs: 1_000,
    relativePath,
    sizeBytes: 10,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('getLibraryVideoPage', () => {
  it('returns unique videos with cached thumbnails and no absolute paths', async () => {
    const directory = createTemporaryDirectory();
    const libraryRoot = join(directory, 'videos');
    mkdirSync(join(libraryRoot, 'nested'), { recursive: true });
    writeFileSync(join(libraryRoot, 'first.mp4'), 'first');
    writeFileSync(join(libraryRoot, 'nested', 'second.mov'), 'second');
    const database = new AppDatabase(join(directory, 'app.sqlite'));
    database.setLibraryRoot(libraryRoot);
    database.syncVideoFiles(
      [
        scannedVideo('first.mp4', 'a'.repeat(64)),
        scannedVideo('nested/second.mov', 'b'.repeat(64)),
      ],
      { hashedFileCount: 2, reusedHashCount: 0 },
    );
    const createThumbnail = vi.fn(async () => Buffer.from('thumbnail'));
    const thumbnailCache = new ThumbnailCache(join(directory, 'thumbnails'), createThumbnail);

    const page = await getLibraryVideoPage(database, thumbnailCache, 0, ALL_VIDEOS_QUERY);

    expect(page).toMatchObject({ pageIndex: 0, pageSize: 24, totalItems: 2, totalPages: 1 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      contentHash: 'a'.repeat(64),
      fileAvailable: true,
      fileName: 'first.mp4',
      playbackUrl: `local-video://media/${'a'.repeat(64)}`,
      relativePath: 'first.mp4',
      thumbnailDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
    });
    expect(page.items[0]).not.toHaveProperty('absolutePath');
    expect(createThumbnail).toHaveBeenCalledTimes(2);
    database.close();
  });

  it('does not access a database path outside the selected root', async () => {
    const directory = createTemporaryDirectory();
    const libraryRoot = join(directory, 'videos');
    mkdirSync(libraryRoot, { recursive: true });
    const database = new AppDatabase(join(directory, 'app.sqlite'));
    database.setLibraryRoot(libraryRoot);
    database.syncVideoFiles([scannedVideo('../outside.mp4', 'a'.repeat(64))], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    const createThumbnail = vi.fn(async () => Buffer.from('thumbnail'));
    const thumbnailCache = new ThumbnailCache(join(directory, 'thumbnails'), createThumbnail);

    const page = await getLibraryVideoPage(database, thumbnailCache, 0, ALL_VIDEOS_QUERY);

    expect(page.items[0]).toMatchObject({
      fileAvailable: false,
      playbackUrl: null,
      thumbnailDataUrl: null,
    });
    expect(createThumbnail).not.toHaveBeenCalled();
    database.close();
  });

  it('keeps an available video in the page when thumbnail generation fails', async () => {
    const directory = createTemporaryDirectory();
    const libraryRoot = join(directory, 'videos');
    mkdirSync(libraryRoot, { recursive: true });
    writeFileSync(join(libraryRoot, 'unsupported.mkv'), 'video');
    const database = new AppDatabase(join(directory, 'app.sqlite'));
    database.setLibraryRoot(libraryRoot);
    database.syncVideoFiles([scannedVideo('unsupported.mkv', 'a'.repeat(64))], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    const thumbnailCache = new ThumbnailCache(join(directory, 'thumbnails'), async () => {
      throw new Error('Unsupported codec.');
    });

    const page = await getLibraryVideoPage(database, thumbnailCache, 0, ALL_VIDEOS_QUERY);

    expect(page.items[0]).toMatchObject({ fileAvailable: true, thumbnailDataUrl: null });
    database.close();
  });

  it('rejects invalid page indexes', async () => {
    const directory = createTemporaryDirectory();
    const database = new AppDatabase(join(directory, 'app.sqlite'));
    const thumbnailCache = new ThumbnailCache(join(directory, 'thumbnails'), async () => null);

    await expect(
      getLibraryVideoPage(database, thumbnailCache, -1, ALL_VIDEOS_QUERY),
    ).rejects.toThrow('Invalid video page index.');
    database.close();
  });
});

describe('parseLibraryVideoQuery', () => {
  it('trims a valid title query', () => {
    expect(
      parseLibraryVideoQuery({
        ...ALL_VIDEOS_QUERY,
        searchQuery: '  유머  ',
      }),
    ).toEqual({ ...ALL_VIDEOS_QUERY, searchQuery: '유머' });
  });

  it('rejects invalid sort and date ranges', () => {
    expect(() => parseLibraryVideoQuery({ ...ALL_VIDEOS_QUERY, sortField: 'fileName' })).toThrow(
      'Invalid video library query.',
    );
    expect(() =>
      parseLibraryVideoQuery({ ...ALL_VIDEOS_QUERY, dateFromMs: 2, dateToMs: 1 }),
    ).toThrow('Invalid video library query.');
  });
});
