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
        metadataRegistered: false,
        metadataUpdatedAt: null,
        relativePath: 'first.mp4',
        sizeBytes: 10,
      },
      {
        contentHash: secondHash,
        fileName: 'middle.mov',
        metadataRegistered: false,
        metadataUpdatedAt: null,
        relativePath: 'middle.mov',
        sizeBytes: 10,
      },
    ]);
    expect(database.getLibraryVideos(2, 2)).toEqual([
      {
        contentHash: thirdHash,
        fileName: 'z-last.webm',
        metadataRegistered: false,
        metadataUpdatedAt: null,
        relativePath: 'z-last.webm',
        sizeBytes: 10,
      },
    ]);
    database.close();
  });

  it('returns one deterministic file location by content hash', () => {
    const database = new AppDatabase(createDatabasePath());
    const contentHash = 'a'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles(
      [scannedVideo('nested/duplicate.mp4', contentHash), scannedVideo('first.mp4', contentHash)],
      { hashedFileCount: 2, reusedHashCount: 0 },
    );

    expect(database.getLibraryVideoByHash(contentHash)).toEqual({
      contentHash,
      fileName: 'first.mp4',
      metadataRegistered: false,
      metadataUpdatedAt: null,
      relativePath: 'first.mp4',
      sizeBytes: 10,
    });
    expect(database.getLibraryVideoByHash('b'.repeat(64))).toBeNull();
    database.close();
  });

  it('stores current video metadata and records only actual changes', () => {
    const databasePath = createDatabasePath();
    const database = new AppDatabase(databasePath);
    const contentHash = 'a'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles([scannedVideo('first.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    expect(database.getVideoMetadata(contentHash)).toEqual({
      contentHash,
      current: null,
      revisions: [],
    });

    const firstSaved = database.saveVideoMetadata(contentHash, {
      sourceCaption: 'Original caption',
      sourceUrl: 'https://www.instagram.com/reel/example/',
    });

    expect(firstSaved.current).toMatchObject({
      sourceCaption: 'Original caption',
      sourceUrl: 'https://www.instagram.com/reel/example/',
      updatedAt: expect.any(String),
    });
    expect(firstSaved.revisions).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        sourceCaption: 'Original caption',
        sourceUrl: 'https://www.instagram.com/reel/example/',
        createdAt: expect.any(String),
      }),
    ]);
    expect(database.getLibraryVideos(24, 0)[0]).toMatchObject({
      metadataRegistered: true,
      metadataUpdatedAt: expect.any(String),
    });

    const unchanged = database.saveVideoMetadata(contentHash, {
      sourceCaption: 'Original caption',
      sourceUrl: 'https://www.instagram.com/reel/example/',
    });
    expect(unchanged.revisions).toHaveLength(1);

    const changed = database.saveVideoMetadata(contentHash, {
      sourceCaption: 'Corrected caption',
      sourceUrl: 'https://www.instagram.com/reel/example/',
    });
    expect(changed.current).toMatchObject({ sourceCaption: 'Corrected caption' });
    expect(changed.revisions).toHaveLength(2);
    expect(changed.revisions.map((revision) => revision.sourceCaption)).toEqual([
      'Corrected caption',
      'Original caption',
    ]);
    database.close();

    const reopenedDatabase = new AppDatabase(databasePath);
    expect(reopenedDatabase.getVideoMetadata(contentHash)).toMatchObject({
      current: { sourceCaption: 'Corrected caption' },
      revisions: [{ sourceCaption: 'Corrected caption' }, { sourceCaption: 'Original caption' }],
    });
    reopenedDatabase.close();
  });

  it('keeps metadata linked by content hash when the file location changes', () => {
    const database = new AppDatabase(createDatabasePath());
    const contentHash = 'a'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles([scannedVideo('old-name.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    database.saveVideoMetadata(contentHash, {
      sourceCaption: null,
      sourceUrl: 'https://www.tiktok.com/@example/video/1',
    });

    database.syncVideoFiles([scannedVideo('renamed/new-name.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    expect(database.getVideoMetadata(contentHash).current).toMatchObject({
      sourceUrl: 'https://www.tiktok.com/@example/video/1',
    });
    expect(database.getLibraryVideos(24, 0)[0]).toMatchObject({
      fileName: 'new-name.mp4',
      metadataRegistered: true,
      relativePath: 'renamed/new-name.mp4',
    });
    database.close();
  });

  it('rejects metadata for a video that is not in the library database', () => {
    const database = new AppDatabase(createDatabasePath());

    expect(() =>
      database.saveVideoMetadata('a'.repeat(64), {
        sourceCaption: 'Caption',
        sourceUrl: null,
      }),
    ).toThrow('Video not found.');
    expect(() => database.getVideoMetadata('a'.repeat(64))).toThrow('Video not found.');
    database.close();
  });
});
