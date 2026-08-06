import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppDatabase } from './database';
import type { ScannedVideoFile } from './video-scanner';

const temporaryDirectories: string[] = [];

function createDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-manager-test-'));
  temporaryDirectories.push(directory);
  return join(directory, 'app.sqlite');
}

function scannedVideo(
  relativePath: string,
  contentHash: string,
  modifiedAtMs = 1_000,
): ScannedVideoFile {
  return {
    contentHash,
    fileName: relativePath.split('/').at(-1) ?? relativePath,
    modifiedAtMs,
    relativePath,
    sizeBytes: 10,
  };
}

afterEach(() => {
  vi.useRealTimers();
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

  it('keeps each managed folder snapshot when the selected root changes', () => {
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

    database.syncVideoFiles([scannedVideo('second.mp4', 'b'.repeat(64))], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    database.setLibraryRoot('/videos');

    expect(database.getLibraryStats()).toMatchObject({ fileCount: 1, uniqueVideoCount: 1 });
    expect(database.getVideoFileCache()).toEqual([
      expect.objectContaining({ contentHash: 'a'.repeat(64), relativePath: 'first.mp4' }),
    ]);
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
        modifiedAtMs: 1_000,
        registeredAt: expect.any(String),
        relativePath: 'first.mp4',
        sizeBytes: 10,
      },
      {
        contentHash: secondHash,
        fileName: 'middle.mov',
        metadataRegistered: false,
        metadataUpdatedAt: null,
        modifiedAtMs: 1_000,
        registeredAt: expect.any(String),
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
        modifiedAtMs: 1_000,
        registeredAt: expect.any(String),
        relativePath: 'z-last.webm',
        sizeBytes: 10,
      },
    ]);
    database.close();
  });

  it('orders videos by their first database registration date', () => {
    vi.useFakeTimers();
    const database = new AppDatabase(createDatabasePath());
    const olderHash = 'a'.repeat(64);
    const newerHash = 'b'.repeat(64);
    database.setLibraryRoot('/videos');

    vi.setSystemTime(new Date('2026-08-06T01:00:00.000Z'));
    database.syncVideoFiles([scannedVideo('older.mp4', olderHash, 2_000)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    vi.setSystemTime(new Date('2026-08-06T02:00:00.000Z'));
    database.syncVideoFiles(
      [scannedVideo('older.mp4', olderHash, 2_000), scannedVideo('newer.mp4', newerHash, 1_000)],
      { hashedFileCount: 1, reusedHashCount: 1 },
    );

    expect(database.getLibraryVideos(24, 0).map((video) => video.contentHash)).toEqual([
      newerHash,
      olderHash,
    ]);
    expect(database.getLibraryVideos(24, 0)[0]).toMatchObject({
      modifiedAtMs: 1_000,
      registeredAt: '2026-08-06T02:00:00.000Z',
    });
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
      modifiedAtMs: 1_000,
      registeredAt: expect.any(String),
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

  it('shares metadata when a nested folder is later managed as its own root', () => {
    const database = new AppDatabase(createDatabasePath());
    const contentHash = 'a'.repeat(64);
    database.setLibraryRoot('/A');
    database.syncVideoFiles([scannedVideo('F/humor.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    database.saveVideoMetadata(contentHash, {
      sourceCaption: 'Humor caption',
      sourceUrl: 'https://example.com/humor',
    });

    database.setLibraryRoot('/A/F');
    const summary = database.syncVideoFiles([scannedVideo('humor.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    expect(summary.addedVideoCount).toBe(0);
    expect(database.getLibraryVideos(24, 0)[0]).toMatchObject({
      contentHash,
      metadataRegistered: true,
      relativePath: 'humor.mp4',
    });
    expect(database.getVideoMetadata(contentHash).current).toMatchObject({
      sourceCaption: 'Humor caption',
    });
    database.close();
  });

  it('keeps replaced video history searchable and records copied metadata provenance', () => {
    const database = new AppDatabase(createDatabasePath());
    const originalHash = 'a'.repeat(64);
    const editedHash = 'b'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles([scannedVideo('humor.mp4', originalHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    database.saveVideoMetadata(originalHash, {
      sourceCaption: 'Original humor caption',
      sourceUrl: 'https://www.instagram.com/reel/humor/',
    });

    database.syncVideoFiles([scannedVideo('humor.mp4', editedHash, 2_000)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    expect(database.getLibraryVideos(24, 0)).toEqual([
      expect.objectContaining({ contentHash: editedHash, fileName: 'humor.mp4' }),
    ]);
    expect(database.searchVideoMetadata('humor', editedHash)).toEqual([
      expect.objectContaining({
        contentHash: originalHash,
        fileName: 'humor.mp4',
        filePresent: false,
        sourceCaption: 'Original humor caption',
      }),
    ]);

    const copied = database.saveVideoMetadata(
      editedHash,
      {
        sourceCaption: 'Original humor caption',
        sourceUrl: 'https://www.instagram.com/reel/humor/',
      },
      originalHash,
    );
    expect(copied.revisions[0]).toMatchObject({ copiedFromContentHash: originalHash });
    expect(database.getVideoMetadata(originalHash).revisions).toHaveLength(1);
    database.close();
  });

  it('migrates the legacy single-folder schema without losing files or metadata', () => {
    const databasePath = createDatabasePath();
    const contentHash = 'a'.repeat(64);
    const legacy = new Database(databasePath);
    legacy.pragma('foreign_keys = ON');
    legacy.exec(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE videos (
        content_hash TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE TABLE video_files (
        relative_path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL REFERENCES videos(content_hash),
        file_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        modified_at_ms INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX video_files_content_hash_idx ON video_files(content_hash);
      CREATE TABLE video_metadata (
        content_hash TEXT PRIMARY KEY REFERENCES videos(content_hash),
        source_url TEXT,
        source_caption TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE video_metadata_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash TEXT NOT NULL REFERENCES videos(content_hash),
        source_url TEXT,
        source_caption TEXT,
        created_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('library_root', '/legacy-videos', '2026-08-06T01:00:00.000Z');
    legacy
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('last_scanned_at', '2026-08-06T02:00:00.000Z', '2026-08-06T02:00:00.000Z');
    legacy
      .prepare('INSERT INTO videos (content_hash, created_at) VALUES (?, ?)')
      .run(contentHash, '2026-08-06T01:00:00.000Z');
    legacy
      .prepare(
        `
          INSERT INTO video_files (
            relative_path,
            content_hash,
            file_name,
            size_bytes,
            modified_at_ms,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run('humor.mp4', contentHash, 'humor.mp4', 10, 1_000, '2026-08-06T02:00:00.000Z');
    legacy
      .prepare(
        `
          INSERT INTO video_metadata (
            content_hash,
            source_url,
            source_caption,
            updated_at
          ) VALUES (?, ?, ?, ?)
        `,
      )
      .run(contentHash, 'https://example.com/humor', 'Legacy caption', '2026-08-06T03:00:00.000Z');
    legacy.close();

    const migrated = new AppDatabase(databasePath);

    expect(migrated.getLibraryRoot()).toBe('/legacy-videos');
    expect(migrated.getLibraryStats()).toEqual({
      fileCount: 1,
      lastScannedAt: '2026-08-06T02:00:00.000Z',
      uniqueVideoCount: 1,
    });
    expect(migrated.getLibraryVideos(24, 0)[0]).toMatchObject({
      contentHash,
      fileName: 'humor.mp4',
      registeredAt: '2026-08-06T01:00:00.000Z',
    });
    expect(migrated.getVideoMetadata(contentHash).current).toMatchObject({
      sourceCaption: 'Legacy caption',
    });
    migrated.close();
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
