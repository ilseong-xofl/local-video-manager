import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AppDatabase } from './database';
import type { ScannedVideoFile } from './video-scanner';

const temporaryDirectories: string[] = [];

function createDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-manager-test-'));
  temporaryDirectories.push(directory);
  return join(directory, 'app.sqlite');
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

describe('AppDatabase', () => {
  it('persists one stable library id', () => {
    const databasePath = createDatabasePath();
    const firstDatabase = new AppDatabase(databasePath);
    const libraryId = firstDatabase.getOrCreateLibraryId();
    firstDatabase.close();

    const reopenedDatabase = new AppDatabase(databasePath);
    expect(reopenedDatabase.getOrCreateLibraryId()).toBe(libraryId);
    reopenedDatabase.close();
  });

  it('stores the selected library root', () => {
    const database = new AppDatabase(createDatabasePath());
    expect(database.getLibraryRoot()).toBeNull();

    database.setLibraryRoot('/videos');
    expect(database.getLibraryRoot()).toBe('/videos');
    database.close();
  });

  it('synchronizes file locations while keeping videos unique by content hash', () => {
    const database = new AppDatabase(createDatabasePath());
    const firstHash = 'a'.repeat(64);
    const secondHash = 'b'.repeat(64);
    database.setLibraryRoot('/videos');

    const firstSummary = database.syncVideoFiles(
      [scannedVideo('first.mp4', firstHash), scannedVideo('nested/duplicate.mp4', firstHash)],
      { hashedFileCount: 2, reusedHashCount: 0 },
    );

    expect(firstSummary).toMatchObject({
      addedVideoCount: 1,
      duplicateFileCount: 1,
      fileCount: 2,
      hashedFileCount: 2,
      removedFileCount: 0,
      reusedHashCount: 0,
      uniqueVideoCount: 1,
    });
    expect(database.getLibraryStats()).toMatchObject({ fileCount: 2, uniqueVideoCount: 1 });

    const secondSummary = database.syncVideoFiles(
      [scannedVideo('nested/duplicate.mp4', firstHash), scannedVideo('new.mov', secondHash)],
      { hashedFileCount: 1, reusedHashCount: 1 },
    );

    expect(secondSummary).toMatchObject({
      addedVideoCount: 1,
      duplicateFileCount: 0,
      fileCount: 2,
      removedFileCount: 1,
      uniqueVideoCount: 2,
    });
    expect(database.getVideoFileCache()).toHaveLength(2);
    database.close();
  });

  it('clears file locations when the selected root changes', () => {
    const database = new AppDatabase(createDatabasePath());
    database.setLibraryRoot('/videos');
    database.syncVideoFiles([scannedVideo('first.mp4', 'a'.repeat(64))], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    database.setLibraryRoot('/other-videos');

    expect(database.getLibraryStats()).toEqual({
      fileCount: 0,
      lastScannedAt: null,
      uniqueVideoCount: 0,
    });
    expect(database.getVideoFileCache()).toEqual([]);
    database.close();
  });

  it('returns one deterministic file location per unique video with pagination', () => {
    const database = new AppDatabase(createDatabasePath());
    const firstHash = 'a'.repeat(64);
    const secondHash = 'b'.repeat(64);
    const thirdHash = 'c'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles(
      [
        scannedVideo('first.mp4', firstHash),
        scannedVideo('nested/duplicate.mp4', firstHash),
        scannedVideo('middle.mov', secondHash),
        scannedVideo('z-last.webm', thirdHash),
      ],
      { hashedFileCount: 4, reusedHashCount: 0 },
    );

    expect(database.getLibraryVideos(2, 0)).toEqual([
      {
        contentHash: firstHash,
        fileName: 'first.mp4',
        relativePath: 'first.mp4',
        sizeBytes: 10,
      },
      {
        contentHash: secondHash,
        fileName: 'middle.mov',
        relativePath: 'middle.mov',
        sizeBytes: 10,
      },
    ]);
    expect(database.getLibraryVideos(2, 2)).toEqual([
      {
        contentHash: thirdHash,
        fileName: 'z-last.webm',
        relativePath: 'z-last.webm',
        sizeBytes: 10,
      },
    ]);
    database.close();
  });
});
