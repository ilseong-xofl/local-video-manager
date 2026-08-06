import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import type { LibraryStats, LibraryVideo, VideoScanSummary } from '../shared/contracts';
import type { ScannedVideoFile } from './video-scanner';

const LIBRARY_ID_KEY = 'library_id';
const LIBRARY_ROOT_KEY = 'library_root';
const LAST_SCANNED_AT_KEY = 'last_scanned_at';

interface SettingRow {
  value: string;
}

interface CountRow {
  fileCount: number;
  uniqueVideoCount: number;
}

interface ContentHashRow {
  contentHash: string;
}

interface RelativePathRow {
  relativePath: string;
}

export class AppDatabase {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.migrate();
  }

  public getOrCreateLibraryId(): string {
    const existing = this.getSetting(LIBRARY_ID_KEY);
    if (existing) {
      return existing;
    }

    const libraryId = randomUUID();
    this.setSetting(LIBRARY_ID_KEY, libraryId);
    return libraryId;
  }

  public getLibraryRoot(): string | null {
    return this.getSetting(LIBRARY_ROOT_KEY);
  }

  public setLibraryRoot(rootPath: string): void {
    if (this.getLibraryRoot() === rootPath) {
      return;
    }

    this.database.transaction(() => {
      this.setSetting(LIBRARY_ROOT_KEY, rootPath);
      this.database.prepare('DELETE FROM video_files').run();
      this.deleteSetting(LAST_SCANNED_AT_KEY);
    })();
  }

  public getLibraryStats(): LibraryStats {
    const row = this.database
      .prepare(
        `
          SELECT
            COUNT(*) AS fileCount,
            COUNT(DISTINCT content_hash) AS uniqueVideoCount
          FROM video_files
        `,
      )
      .get() as CountRow;

    return {
      fileCount: row.fileCount,
      lastScannedAt: this.getSetting(LAST_SCANNED_AT_KEY),
      uniqueVideoCount: row.uniqueVideoCount,
    };
  }

  public getVideoFileCache(): ScannedVideoFile[] {
    return this.database
      .prepare(
        `
          SELECT
            content_hash AS contentHash,
            file_name AS fileName,
            modified_at_ms AS modifiedAtMs,
            relative_path AS relativePath,
            size_bytes AS sizeBytes
          FROM video_files
          ORDER BY relative_path
        `,
      )
      .all() as ScannedVideoFile[];
  }

  public getLibraryVideos(limit: number, offset: number): LibraryVideo[] {
    return this.database
      .prepare(
        `
          WITH ranked_files AS (
            SELECT
              content_hash AS contentHash,
              file_name AS fileName,
              relative_path AS relativePath,
              size_bytes AS sizeBytes,
              ROW_NUMBER() OVER (
                PARTITION BY content_hash
                ORDER BY relative_path COLLATE NOCASE, relative_path
              ) AS position
            FROM video_files
          )
          SELECT contentHash, fileName, relativePath, sizeBytes
          FROM ranked_files
          WHERE position = 1
          ORDER BY fileName COLLATE NOCASE, relativePath
          LIMIT ? OFFSET ?
        `,
      )
      .all(limit, offset) as LibraryVideo[];
  }

  public syncVideoFiles(
    files: readonly ScannedVideoFile[],
    scanCounts: Pick<VideoScanSummary, 'hashedFileCount' | 'reusedHashCount'>,
  ): VideoScanSummary {
    const existingHashes = new Set(
      (
        this.database
          .prepare('SELECT content_hash AS contentHash FROM videos')
          .all() as ContentHashRow[]
      ).map((row) => row.contentHash),
    );
    const previousPaths = new Set(
      (
        this.database
          .prepare('SELECT relative_path AS relativePath FROM video_files')
          .all() as RelativePathRow[]
      ).map((row) => row.relativePath),
    );
    const currentHashes = new Set(files.map((file) => file.contentHash));
    const currentPaths = new Set(files.map((file) => file.relativePath));
    const scannedAt = new Date().toISOString();

    const insertVideo = this.database.prepare(
      'INSERT OR IGNORE INTO videos (content_hash, created_at) VALUES (?, ?)',
    );
    const insertFile = this.database.prepare(`
      INSERT INTO video_files (
        relative_path,
        content_hash,
        file_name,
        size_bytes,
        modified_at_ms,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.database.transaction(() => {
      for (const file of files) {
        insertVideo.run(file.contentHash, scannedAt);
      }

      this.database.prepare('DELETE FROM video_files').run();
      for (const file of files) {
        insertFile.run(
          file.relativePath,
          file.contentHash,
          file.fileName,
          file.sizeBytes,
          file.modifiedAtMs,
          scannedAt,
        );
      }

      this.setSetting(LAST_SCANNED_AT_KEY, scannedAt);
    })();

    return {
      addedVideoCount: [...currentHashes].filter((hash) => !existingHashes.has(hash)).length,
      duplicateFileCount: files.length - currentHashes.size,
      fileCount: files.length,
      hashedFileCount: scanCounts.hashedFileCount,
      lastScannedAt: scannedAt,
      removedFileCount: [...previousPaths].filter((path) => !currentPaths.has(path)).length,
      reusedHashCount: scanCounts.reusedHashCount,
      uniqueVideoCount: currentHashes.size,
    };
  }

  public close(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS videos (
        content_hash TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS video_files (
        relative_path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL REFERENCES videos(content_hash),
        file_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        modified_at_ms INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS video_files_content_hash_idx
      ON video_files(content_hash);
    `);
  }

  private getSetting(key: string): string | null {
    const row = this.database.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      SettingRow | undefined;

    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    this.database
      .prepare(
        `
          INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
      )
      .run(key, value, new Date().toISOString());
  }

  private deleteSetting(key: string): void {
    this.database.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  }
}
