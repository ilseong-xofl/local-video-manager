import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LibraryVideoQuery } from '../shared/contracts';
import { AppDatabase, applyPendingDatabaseRestore } from './database';
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

function libraryQuery(overrides: Partial<LibraryVideoQuery> = {}): LibraryVideoQuery {
  return {
    dateFromMs: 0,
    dateToMs: Date.parse('9999-12-31T23:59:59.999Z'),
    reaction: null,
    searchQuery: '',
    sortDirection: 'desc',
    sortField: 'registeredAt',
    tagId: null,
    ...overrides,
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

  it('backs up and restores metadata while preserving the current database automatically', async () => {
    const databasePath = createDatabasePath();
    const backupPath = join(dirname(databasePath), 'manual-backup.sqlite');
    const pendingRestorePath = join(dirname(databasePath), 'pending-restore.sqlite');
    const automaticBackupPath = join(dirname(databasePath), 'before-restore.sqlite');
    const contentHash = 'a'.repeat(64);
    const database = new AppDatabase(databasePath);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles([scannedVideo('first.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    database.saveVideoMetadata(contentHash, {
      sourceCaption: '백업 시점 캡션',
      sourceUrl: 'https://example.com/original',
    });
    const backedUpTag = database.createVideoTag('백업 태그');
    database.setVideoTags(contentHash, [backedUpTag.id]);
    database.setVideoReaction(contentHash, 'hype');
    const backedUpPreset = database.createVideoEditorPreset({
      aspectRatio: '9:16',
      defaultTextStyle: {
        backgroundColor: '#000000',
        backgroundOpacity: 0.8,
        fontFamily: 'Noto Sans KR',
        fontMarket: 'KR',
        fontSizePercent: 4.5,
        fontWeight: 700,
        textAlign: 'center',
        textColor: '#FFFFFF',
      },
      letterboxColor: '#000000',
      name: '릴스 기본',
      platform: 'instagram',
      resizeMode: 'crop',
    });
    const backedUpTextPreset = database.createVideoEditorTextPreset({
      name: '상단 제목',
      overlays: [
        {
          region: { height: 0.16, width: 0.76, x: 0.12, y: 0.08 },
          style: {
            backgroundColor: '#111111',
            backgroundOpacity: 1,
            fontFamily: 'Noto Sans KR',
            fontMarket: 'KR',
            fontSizePercent: 3,
            fontWeight: 700,
            textAlign: 'center',
            textColor: '#FFFFFF',
          },
        },
      ],
    });
    const libraryId = database.getOrCreateLibraryId();

    await database.createBackup(backupPath, '0.1.1');
    const backupFile = new Database(backupPath, { readonly: true });
    expect(
      backupFile
        .prepare(
          'SELECT app_version AS appVersion, schema_version AS schemaVersion FROM backup_manifest',
        )
        .get(),
    ).toEqual({ appVersion: '0.1.1', schemaVersion: 5 });
    backupFile.close();

    database.saveVideoMetadata(contentHash, {
      sourceCaption: '복원 직전 캡션',
      sourceUrl: 'https://example.com/changed',
    });
    await database.stageBackupRestore(backupPath, pendingRestorePath, automaticBackupPath, '0.1.1');
    expect(existsSync(pendingRestorePath)).toBe(true);
    expect(existsSync(automaticBackupPath)).toBe(true);
    database.close();

    expect(applyPendingDatabaseRestore(databasePath, pendingRestorePath)).toBe(true);
    const restoredDatabase = new AppDatabase(databasePath);
    expect(restoredDatabase.getOrCreateLibraryId()).toBe(libraryId);
    expect(restoredDatabase.getLibraryRoot()).toBe(resolve('/videos'));
    expect(restoredDatabase.getVideoMetadata(contentHash).current).toMatchObject({
      sourceCaption: '백업 시점 캡션',
      sourceUrl: 'https://example.com/original',
    });
    expect(restoredDatabase.getVideoTags(contentHash)).toEqual([
      { id: backedUpTag.id, name: '백업 태그' },
    ]);
    expect(restoredDatabase.getLibraryVideoByHash(contentHash)?.reaction).toBe('hype');
    expect(restoredDatabase.getVideoEditorPresets()).toEqual([
      expect.objectContaining({ id: backedUpPreset.id, name: '릴스 기본' }),
    ]);
    expect(restoredDatabase.getVideoEditorTextPresets()).toEqual([
      expect.objectContaining({ id: backedUpTextPreset.id, name: '상단 제목' }),
    ]);
    restoredDatabase.close();

    const automaticBackup = new AppDatabase(automaticBackupPath);
    expect(automaticBackup.getVideoMetadata(contentHash).current).toMatchObject({
      sourceCaption: '복원 직전 캡션',
      sourceUrl: 'https://example.com/changed',
    });
    automaticBackup.close();
  });

  it('rejects an invalid restore file without creating a pending restore', async () => {
    const databasePath = createDatabasePath();
    const invalidBackupPath = join(dirname(databasePath), 'invalid.sqlite');
    const pendingRestorePath = join(dirname(databasePath), 'pending-restore.sqlite');
    const automaticBackupPath = join(dirname(databasePath), 'before-restore.sqlite');
    const database = new AppDatabase(databasePath);
    database.setLibraryRoot('/videos');
    writeFileSync(invalidBackupPath, 'not a sqlite database');

    await expect(
      database.stageBackupRestore(
        invalidBackupPath,
        pendingRestorePath,
        automaticBackupPath,
        '0.1.1',
      ),
    ).rejects.toThrow('Invalid Local Video Manager database backup.');
    expect(database.getLibraryRoot()).toBe(resolve('/videos'));
    expect(existsSync(pendingRestorePath)).toBe(false);
    expect(existsSync(automaticBackupPath)).toBe(false);
    database.close();
  });

  it('keeps an existing backup when creating its replacement fails validation', async () => {
    const databasePath = createDatabasePath();
    const backupPath = join(dirname(databasePath), 'existing-backup.sqlite');
    const database = new AppDatabase(databasePath);
    writeFileSync(backupPath, 'existing backup');

    await expect(database.createBackup(backupPath, '')).rejects.toThrow(
      'Invalid Local Video Manager database backup.',
    );
    expect(readFileSync(backupPath, 'utf8')).toBe('existing backup');
    database.close();
  });

  it('keeps the current database when a staged restore file is corrupted', () => {
    const databasePath = createDatabasePath();
    const pendingRestorePath = join(dirname(databasePath), 'pending-restore.sqlite');
    const database = new AppDatabase(databasePath);
    database.setLibraryRoot('/videos');
    database.close();
    writeFileSync(pendingRestorePath, 'corrupted pending restore');

    expect(() => applyPendingDatabaseRestore(databasePath, pendingRestorePath)).toThrow(
      'Invalid Local Video Manager database backup.',
    );
    expect(existsSync(pendingRestorePath)).toBe(false);

    const reopenedDatabase = new AppDatabase(databasePath);
    expect(reopenedDatabase.getLibraryRoot()).toBe(resolve('/videos'));
    reopenedDatabase.close();
  });

  it('stores the selected library root', () => {
    const database = new AppDatabase(createDatabasePath());
    expect(database.getLibraryRoot()).toBeNull();

    database.setLibraryRoot('/videos');
    expect(database.getLibraryRoot()).toBe(resolve('/videos'));
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
        reaction: null,
        registeredAt: expect.any(String),
        relativePath: 'first.mp4',
        sizeBytes: 10,
        sourceUrl: null,
      },
      {
        contentHash: secondHash,
        fileName: 'middle.mov',
        metadataRegistered: false,
        metadataUpdatedAt: null,
        modifiedAtMs: 1_000,
        reaction: null,
        registeredAt: expect.any(String),
        relativePath: 'middle.mov',
        sizeBytes: 10,
        sourceUrl: null,
      },
    ]);
    expect(database.getLibraryVideos(2, 2)).toEqual([
      {
        contentHash: thirdHash,
        fileName: 'z-last.webm',
        metadataRegistered: false,
        metadataUpdatedAt: null,
        modifiedAtMs: 1_000,
        reaction: null,
        registeredAt: expect.any(String),
        relativePath: 'z-last.webm',
        sizeBytes: 10,
        sourceUrl: null,
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

  it('filters and sorts videos by registration or modified date', () => {
    vi.useFakeTimers();
    const database = new AppDatabase(createDatabasePath());
    const olderHash = 'a'.repeat(64);
    const newerHash = 'b'.repeat(64);
    const olderModifiedAt = Date.parse('2026-07-01T00:00:00.000Z');
    const newerModifiedAt = Date.parse('2026-05-01T00:00:00.000Z');
    database.setLibraryRoot('/videos');

    vi.setSystemTime(new Date('2025-06-01T00:00:00.000Z'));
    database.syncVideoFiles([scannedVideo('older.mp4', olderHash, olderModifiedAt)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    database.syncVideoFiles(
      [
        scannedVideo('older.mp4', olderHash, olderModifiedAt),
        scannedVideo('newer.mp4', newerHash, newerModifiedAt),
      ],
      { hashedFileCount: 1, reusedHashCount: 1 },
    );

    expect(
      database
        .getLibraryVideos(24, 0, libraryQuery({ sortDirection: 'asc' }))
        .map((video) => video.contentHash),
    ).toEqual([olderHash, newerHash]);
    expect(
      database
        .getLibraryVideos(24, 0, libraryQuery({ sortDirection: 'desc' }))
        .map((video) => video.contentHash),
    ).toEqual([newerHash, olderHash]);
    expect(
      database
        .getLibraryVideos(24, 0, libraryQuery({ sortDirection: 'asc', sortField: 'modifiedAt' }))
        .map((video) => video.contentHash),
    ).toEqual([newerHash, olderHash]);
    expect(
      database
        .getLibraryVideos(24, 0, libraryQuery({ sortDirection: 'desc', sortField: 'modifiedAt' }))
        .map((video) => video.contentHash),
    ).toEqual([olderHash, newerHash]);

    const registeredIn2026 = libraryQuery({
      dateFromMs: Date.parse('2026-01-01T00:00:00.000Z'),
      dateToMs: Date.parse('2026-12-31T23:59:59.999Z'),
    });
    expect(database.getLibraryVideoCount(registeredIn2026)).toBe(1);
    expect(database.getLibraryVideos(24, 0, registeredIn2026)[0].contentHash).toBe(newerHash);

    const modifiedAfterJune = libraryQuery({
      dateFromMs: Date.parse('2026-06-01T00:00:00.000Z'),
      dateToMs: Date.parse('2026-08-01T00:00:00.000Z'),
      sortField: 'modifiedAt',
    });
    expect(database.getLibraryVideoCount(modifiedAfterJune)).toBe(1);
    expect(database.getLibraryVideos(24, 0, modifiedAfterJune)[0].contentHash).toBe(olderHash);
    database.close();
  });

  it('partially matches an NFC title query against macOS NFD file names', () => {
    const database = new AppDatabase(createDatabasePath());
    const sourceHash = 'a'.repeat(64);
    const targetHash = 'b'.repeat(64);
    const nfdFileName = '일본-유머-0001.mp4'.normalize('NFD');
    database.setLibraryRoot('/videos');
    database.syncVideoFiles(
      [scannedVideo(nfdFileName, sourceHash), scannedVideo('target.mp4', targetHash)],
      { hashedFileCount: 2, reusedHashCount: 0 },
    );
    database.saveVideoMetadata(sourceHash, {
      sourceCaption: '원본 캡션',
      sourceUrl: null,
    });

    const query = libraryQuery({ searchQuery: '유머' });
    expect(database.getLibraryVideoCount(query)).toBe(1);
    expect(database.getLibraryVideos(24, 0, query)[0].contentHash).toBe(sourceHash);
    expect(database.searchVideoMetadata('유머', targetHash)).toEqual([
      expect.objectContaining({ contentHash: sourceHash, fileName: nfdFileName }),
    ]);
    database.close();
  });

  it('creates, renames, and case-insensitively deduplicates tags', () => {
    const database = new AppDatabase(createDatabasePath());
    const firstTag = database.createVideoTag('  Humor  ');
    const secondTag = database.createVideoTag('Popular');

    expect(firstTag).toMatchObject({ name: 'Humor', videoCount: 0 });
    expect(database.getTags()).toEqual([firstTag, secondTag]);
    expect(() => database.createVideoTag('humor')).toThrow('A tag with this name already exists.');
    expect(database.renameVideoTag(firstTag.id, 'Comedy')).toEqual({
      id: firstTag.id,
      name: 'Comedy',
      videoCount: 0,
    });
    expect(() => database.renameVideoTag(secondTag.id, 'COMEDY')).toThrow(
      'A tag with this name already exists.',
    );
    database.close();
  });

  it('assigns multiple tags, filters by one tag, and deletes only tag assignments', () => {
    const database = new AppDatabase(createDatabasePath());
    const firstHash = 'a'.repeat(64);
    const secondHash = 'b'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles(
      [scannedVideo('first.mp4', firstHash), scannedVideo('second.mp4', secondHash)],
      { hashedFileCount: 2, reusedHashCount: 0 },
    );
    database.saveVideoMetadata(firstHash, {
      sourceCaption: '태그 삭제 후에도 유지할 캡션',
      sourceUrl: null,
    });
    const comedy = database.createVideoTag('Comedy');
    const popular = database.createVideoTag('Popular');

    expect(database.setVideoTags(firstHash, [comedy.id, popular.id])).toEqual([
      { id: comedy.id, name: 'Comedy' },
      { id: popular.id, name: 'Popular' },
    ]);
    database.setVideoTags(secondHash, [popular.id]);
    expect(database.getTags()).toEqual([
      { ...comedy, videoCount: 1 },
      { ...popular, videoCount: 2 },
    ]);

    const comedyQuery = libraryQuery({ tagId: comedy.id });
    expect(database.getLibraryVideoCount(comedyQuery)).toBe(1);
    expect(database.getLibraryVideos(24, 0, comedyQuery)[0].contentHash).toBe(firstHash);

    expect(() => database.setVideoTags(firstHash, [999_999])).toThrow('Tag not found.');
    expect(database.getVideoTags(firstHash)).toHaveLength(2);

    database.deleteVideoTag(comedy.id);
    expect(database.getVideoTags(firstHash)).toEqual([{ id: popular.id, name: 'Popular' }]);
    expect(database.getVideoMetadata(firstHash).current?.sourceCaption).toBe(
      '태그 삭제 후에도 유지할 캡션',
    );
    expect(database.getLibraryVideoCount()).toBe(2);
    database.close();
  });

  it('stores one video reaction and filters hype, unhype, or unmarked videos', () => {
    const database = new AppDatabase(createDatabasePath());
    const hypeHash = 'a'.repeat(64);
    const unhypeHash = 'b'.repeat(64);
    const unmarkedHash = 'c'.repeat(64);
    database.setLibraryRoot('/videos');
    database.syncVideoFiles(
      [
        scannedVideo('hype.mp4', hypeHash),
        scannedVideo('unhype.mp4', unhypeHash),
        scannedVideo('unmarked.mp4', unmarkedHash),
      ],
      { hashedFileCount: 3, reusedHashCount: 0 },
    );

    expect(database.setVideoReaction(hypeHash, 'hype')).toBe('hype');
    expect(database.setVideoReaction(unhypeHash, 'unhype')).toBe('unhype');
    expect(database.getLibraryVideoByHash(hypeHash)?.reaction).toBe('hype');
    expect(
      database
        .getLibraryVideos(24, 0, libraryQuery({ reaction: 'hype' }))
        .map((video) => video.contentHash),
    ).toEqual([hypeHash]);
    expect(database.getLibraryVideoCount(libraryQuery({ reaction: 'unhype' }))).toBe(1);
    expect(
      database
        .getLibraryVideos(24, 0, libraryQuery({ reaction: 'none' }))
        .map((video) => video.contentHash),
    ).toEqual([unmarkedHash]);

    expect(database.setVideoReaction(hypeHash, null)).toBeNull();
    expect(database.getLibraryVideoCount(libraryQuery({ reaction: 'none' }))).toBe(2);
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
      reaction: null,
      registeredAt: expect.any(String),
      relativePath: 'first.mp4',
      sizeBytes: 10,
      sourceUrl: null,
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
      sourceUrl: 'https://www.instagram.com/reel/example/',
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

    expect(migrated.getLibraryRoot()).toBe(resolve('/legacy-videos'));
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

  it('creates, updates, lists, and deletes video editor presets', () => {
    const database = new AppDatabase(createDatabasePath());
    const created = database.createVideoEditorPreset({
      aspectRatio: '9:16',
      defaultTextStyle: {
        backgroundColor: '#111111',
        backgroundOpacity: 0.75,
        fontFamily: 'Noto Sans JP',
        fontMarket: 'JP',
        fontSizePercent: 5,
        fontWeight: 700,
        textAlign: 'center',
        textColor: '#FFFFFF',
      },
      letterboxColor: '#000000',
      name: '틱톡 기본',
      platform: 'tiktok',
      resizeMode: 'crop',
    });

    expect(created.defaultTextStyle).toMatchObject({
      fontFamily: 'Noto Sans JP',
      fontMarket: 'JP',
    });
    expect(database.getVideoEditorPresets()).toEqual([created]);

    const updated = database.updateVideoEditorPreset(created.id, {
      ...created,
      aspectRatio: '1:1',
      name: '틱톡 정사각형',
      resizeMode: 'letterbox',
    });
    expect(updated).toMatchObject({
      aspectRatio: '1:1',
      id: created.id,
      name: '틱톡 정사각형',
      resizeMode: 'letterbox',
    });
    expect(updated.defaultTextStyle).toMatchObject({
      fontFamily: 'Noto Sans JP',
      fontMarket: 'JP',
    });

    expect(() =>
      database.createVideoEditorPreset({
        ...updated,
        name: '틱톡 정사각형',
      }),
    ).toThrow('A video editor preset with this name already exists.');

    database.deleteVideoEditorPreset(created.id);
    expect(database.getVideoEditorPresets()).toEqual([]);
    expect(() => database.deleteVideoEditorPreset(created.id)).toThrow(
      'Video editor preset not found.',
    );
    database.close();
  });

  it('lists newly created video editor presets first', () => {
    const database = new AppDatabase(createDatabasePath());
    const input = {
      aspectRatio: '9:16' as const,
      defaultTextStyle: {
        backgroundColor: '#111111',
        backgroundOpacity: 1,
        fontFamily: 'Montserrat',
        fontMarket: 'US' as const,
        fontSizePercent: 3,
        fontWeight: 700 as const,
        textAlign: 'center' as const,
        textColor: '#FFFFFF',
      },
      letterboxColor: '#000000',
      platform: 'instagram' as const,
      resizeMode: 'crop' as const,
    };
    const first = database.createVideoEditorPreset({ ...input, name: '첫 설정' });
    const second = database.createVideoEditorPreset({ ...input, name: '두 번째 설정' });

    expect(database.getVideoEditorPresets().map((preset) => preset.id)).toEqual([
      second.id,
      first.id,
    ]);
    database.close();
  });

  it('adds the Korean default font when loading legacy editor styles', () => {
    const databasePath = createDatabasePath();
    const database = new AppDatabase(databasePath);
    const style = {
      backgroundColor: '#111111',
      backgroundOpacity: 1,
      fontFamily: 'Noto Sans JP',
      fontMarket: 'JP' as const,
      fontSizePercent: 3,
      fontWeight: 700 as const,
      textAlign: 'center' as const,
      textColor: '#FFFFFF',
    };
    const preset = database.createVideoEditorPreset({
      aspectRatio: '9:16',
      defaultTextStyle: style,
      letterboxColor: '#000000',
      name: '이전 편집 설정',
      platform: 'instagram',
      resizeMode: 'letterbox',
    });
    const textPreset = database.createVideoEditorTextPreset({
      name: '이전 텍스트 프리셋',
      overlays: [{ region: { height: 0.2, width: 0.8, x: 0.1, y: 0.1 }, style }],
    });
    database.close();

    const legacyStyle = { ...style } as Partial<typeof style>;
    delete legacyStyle.fontFamily;
    delete legacyStyle.fontMarket;
    const rawDatabase = new Database(databasePath);
    rawDatabase
      .prepare('UPDATE video_editor_presets SET default_text_style_json = ? WHERE id = ?')
      .run(JSON.stringify(legacyStyle), preset.id);
    rawDatabase
      .prepare('UPDATE video_editor_text_presets SET overlays_json = ? WHERE id = ?')
      .run(
        JSON.stringify([
          { region: { height: 0.2, width: 0.8, x: 0.1, y: 0.1 }, style: legacyStyle },
        ]),
        textPreset.id,
      );
    rawDatabase.close();

    const reopenedDatabase = new AppDatabase(databasePath);
    expect(reopenedDatabase.getVideoEditorPresets()[0].defaultTextStyle).toMatchObject({
      fontFamily: 'Noto Sans KR',
      fontMarket: 'KR',
    });
    expect(reopenedDatabase.getVideoEditorTextPresets()[0].overlays[0].style).toMatchObject({
      fontFamily: 'Noto Sans KR',
      fontMarket: 'KR',
    });
    reopenedDatabase.close();
  });

  it('creates, updates, lists, limits, and deletes global text presets', () => {
    const database = new AppDatabase(createDatabasePath());
    const input = {
      overlays: [
        {
          region: { height: 0.16, width: 0.76, x: 0.12, y: 0.08 },
          style: {
            backgroundColor: '#111111',
            backgroundOpacity: 1,
            fontFamily: 'Noto Sans KR',
            fontMarket: 'KR' as const,
            fontSizePercent: 3,
            fontWeight: 700 as const,
            textAlign: 'center' as const,
            textColor: '#FFFFFF',
          },
        },
      ],
    };
    const presets = Array.from({ length: 5 }, (_, index) =>
      database.createVideoEditorTextPreset({ ...input, name: `프리셋 ${index + 1}` }),
    );

    expect(presets[0].overlays[0].style).toMatchObject({
      fontFamily: 'Noto Sans KR',
      fontMarket: 'KR',
    });
    expect(database.getVideoEditorTextPresets().map((preset) => preset.id)).toEqual(
      [...presets].reverse().map((preset) => preset.id),
    );

    const updated = database.updateVideoEditorTextPreset(presets[1].id, {
      name: '프리셋 2 수정',
      overlays: [
        {
          region: { height: 0.22, width: 0.68, x: 0.16, y: 0.12 },
          style: { ...input.overlays[0].style, fontSizePercent: 5 },
        },
      ],
    });
    expect(updated).toMatchObject({
      createdAt: presets[1].createdAt,
      id: presets[1].id,
      name: '프리셋 2 수정',
      overlays: [
        {
          region: { height: 0.22, width: 0.68, x: 0.16, y: 0.12 },
          style: { ...input.overlays[0].style, fontSizePercent: 5 },
        },
      ],
    });
    expect(database.getVideoEditorTextPresets()).toHaveLength(5);
    expect(() =>
      database.updateVideoEditorTextPreset(presets[1].id, {
        ...input,
        name: '프리셋 1',
      }),
    ).toThrow('A video editor text preset with this name already exists.');

    expect(() =>
      database.createVideoEditorTextPreset({ ...input, name: '여섯 번째 프리셋' }),
    ).toThrow('The video editor text preset limit has been reached.');
    expect(() => database.createVideoEditorTextPreset({ ...input, name: '프리셋 1' })).toThrow(
      'A video editor text preset with this name already exists.',
    );

    database.deleteVideoEditorTextPreset(presets[0].id);
    expect(database.getVideoEditorTextPresets()).toHaveLength(4);
    expect(() => database.deleteVideoEditorTextPreset(presets[0].id)).toThrow(
      'Video editor text preset not found.',
    );
    database.close();
  });
});
