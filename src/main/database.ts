import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import type {
  LibraryStats,
  LibraryVideo,
  LibraryVideoQuery,
  ManagedVideoTag,
  VideoTag,
  VideoMetadataDetail,
  VideoMetadataInput,
  VideoMetadataRevision,
  VideoMetadataSearchResult,
  VideoMetadataSnapshot,
  VideoScanSummary,
} from '../shared/contracts';
import { VIDEO_TAG_NAME_MAX_LENGTH } from '../shared/contracts';
import type { ScannedVideoFile } from './video-scanner';

const LIBRARY_ID_KEY = 'library_id';
const ACTIVE_MANAGED_FOLDER_ID_KEY = 'active_managed_folder_id';
const LEGACY_LIBRARY_ROOT_KEY = 'library_root';
const LEGACY_LAST_SCANNED_AT_KEY = 'last_scanned_at';
const METADATA_SEARCH_LIMIT = 50;
const DATABASE_APPLICATION_ID = 0x4c564d31;
const DATABASE_SCHEMA_VERSION = 2;
const ALL_LIBRARY_VIDEOS_QUERY: LibraryVideoQuery = {
  dateFromMs: 0,
  dateToMs: Date.parse('9999-12-31T23:59:59.999Z'),
  searchQuery: '',
  sortDirection: 'desc',
  sortField: 'registeredAt',
  tagId: null,
};

interface SettingRow {
  value: string;
}

interface CountRow {
  fileCount: number;
  uniqueVideoCount: number;
}

interface TotalRow {
  totalItems: number;
}

interface ContentHashRow {
  contentHash: string;
}

interface RelativePathRow {
  relativePath: string;
}

interface ManagedFolderRow {
  id: number;
  lastScannedAt: string | null;
  rootPath: string;
}

interface LibraryVideoRow {
  contentHash: string;
  fileName: string;
  metadataUpdatedAt: string | null;
  modifiedAtMs: number;
  registeredAt: string;
  relativePath: string;
  sizeBytes: number;
}

interface MetadataSearchRow {
  contentHash: string;
  fileName: string;
  filePresent: number;
  registeredAt: string;
  sourceCaption: string | null;
  sourceUrl: string | null;
}

interface TableInfoRow {
  name: string;
}

interface VideoExistsRow {
  found: number;
}

type VideoTagRow = VideoTag;

type ManagedVideoTagRow = ManagedVideoTag;

interface TagExistsRow {
  found: number;
}

interface TagIdRow {
  id: number;
}

interface VideoCountRow {
  videoCount: number;
}

interface BackupManifestRow {
  appVersion: string;
  schemaVersion: number;
}

type MetadataSearchRecord = Omit<VideoMetadataSearchResult, 'thumbnailDataUrl'>;

function normalizeLibraryRoot(rootPath: string): { normalizedPath: string; rootPath: string } {
  const resolvedPath = resolve(rootPath);
  return {
    normalizedPath: process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath,
    rootPath: resolvedPath,
  };
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

function normalizeTagName(value: string): { name: string; normalizedName: string } {
  const name = value.trim().normalize('NFC');
  if (!name || name.length > VIDEO_TAG_NAME_MAX_LENGTH) {
    throw new Error('Invalid video tag name.');
  }

  return { name, normalizedName: normalizeSearchText(name) };
}

function databasePathsMatch(firstPath: string, secondPath: string): boolean {
  const first = resolve(firstPath);
  const second = resolve(secondPath);
  return process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase()
    : first === second;
}

function removeExactFileIfPresent(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function prepareBackupDestination(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  removeExactFileIfPresent(filePath);
  removeExactFileIfPresent(`${filePath}-shm`);
  removeExactFileIfPresent(`${filePath}-wal`);
}

function validateBackupDatabase(filePath: string): void {
  let backupDatabase: Database.Database | null = null;

  try {
    backupDatabase = new Database(filePath, { fileMustExist: true, readonly: true });
    const applicationId = backupDatabase.pragma('application_id', { simple: true }) as number;
    const schemaVersion = backupDatabase.pragma('user_version', { simple: true }) as number;
    const integrity = backupDatabase.pragma('integrity_check', { simple: true }) as string;
    const foreignKeyErrors = backupDatabase.pragma('foreign_key_check') as unknown[];
    const manifest = backupDatabase
      .prepare(
        `
          SELECT
            app_version AS appVersion,
            schema_version AS schemaVersion
          FROM backup_manifest
          WHERE id = 1
        `,
      )
      .get() as BackupManifestRow | undefined;

    if (
      applicationId !== DATABASE_APPLICATION_ID ||
      schemaVersion < 1 ||
      schemaVersion > DATABASE_SCHEMA_VERSION ||
      integrity !== 'ok' ||
      foreignKeyErrors.length > 0 ||
      !manifest?.appVersion ||
      manifest.schemaVersion !== schemaVersion
    ) {
      throw new Error('Invalid Local Video Manager database backup.');
    }
  } catch {
    throw new Error('Invalid Local Video Manager database backup.');
  } finally {
    backupDatabase?.close();
  }
}

export function applyPendingDatabaseRestore(
  databasePath: string,
  pendingRestorePath: string,
): boolean {
  const rollbackPath = `${databasePath}.restore-rollback`;

  if (existsSync(rollbackPath)) {
    if (existsSync(databasePath)) {
      try {
        validateBackupDatabase(databasePath);
        removeExactFileIfPresent(rollbackPath);
        removeExactFileIfPresent(pendingRestorePath);
        return true;
      } catch {
        removeExactFileIfPresent(databasePath);
      }
    }

    renameSync(rollbackPath, databasePath);
  }

  if (!existsSync(pendingRestorePath)) {
    return false;
  }

  try {
    validateBackupDatabase(pendingRestorePath);
  } catch (error) {
    removeExactFileIfPresent(pendingRestorePath);
    throw error;
  }
  let currentDatabaseMoved = false;

  try {
    if (existsSync(databasePath)) {
      renameSync(databasePath, rollbackPath);
      currentDatabaseMoved = true;
    }
    removeExactFileIfPresent(`${databasePath}-shm`);
    removeExactFileIfPresent(`${databasePath}-wal`);
    renameSync(pendingRestorePath, databasePath);
    validateBackupDatabase(databasePath);
    removeExactFileIfPresent(rollbackPath);
    return true;
  } catch (error) {
    removeExactFileIfPresent(databasePath);
    if (currentDatabaseMoved && existsSync(rollbackPath)) {
      renameSync(rollbackPath, databasePath);
    }
    removeExactFileIfPresent(pendingRestorePath);
    throw error;
  }
}

function getLibraryVideoQueryParts(query: LibraryVideoQuery): {
  dateColumn: 'ranked_files.modifiedAtMs' | 'videos.created_at';
  dateFrom: number | string;
  dateTo: number | string;
  normalizedSearchQuery: string;
  orderBy: string;
} {
  const isModifiedDate = query.sortField === 'modifiedAt';
  const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';

  return {
    dateColumn: isModifiedDate ? 'ranked_files.modifiedAtMs' : 'videos.created_at',
    dateFrom: isModifiedDate ? query.dateFromMs : new Date(query.dateFromMs).toISOString(),
    dateTo: isModifiedDate ? query.dateToMs : new Date(query.dateToMs).toISOString(),
    normalizedSearchQuery: normalizeSearchText(query.searchQuery),
    orderBy: isModifiedDate
      ? `ranked_files.modifiedAtMs ${direction}, videos.created_at DESC`
      : `videos.created_at ${direction}, ranked_files.modifiedAtMs DESC`,
  };
}

export class AppDatabase {
  private readonly database: Database.Database;
  private readonly databasePath: string;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.databasePath = resolve(databasePath);
    this.database = new Database(this.databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.database.function('normalize_search_text', { deterministic: true }, (value: unknown) =>
      typeof value === 'string' ? normalizeSearchText(value) : '',
    );
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
    return this.getActiveManagedFolder()?.rootPath ?? null;
  }

  public setLibraryRoot(rootPath: string): void {
    const folderId = this.getOrCreateManagedFolder(rootPath);
    this.setSetting(ACTIVE_MANAGED_FOLDER_ID_KEY, String(folderId));
  }

  public getLibraryStats(): LibraryStats {
    const managedFolder = this.getActiveManagedFolder();
    if (!managedFolder) {
      return { fileCount: 0, lastScannedAt: null, uniqueVideoCount: 0 };
    }

    const row = this.database
      .prepare(
        `
          SELECT
            COUNT(*) AS fileCount,
            COUNT(DISTINCT content_hash) AS uniqueVideoCount
          FROM video_files
          WHERE managed_folder_id = ? AND is_present = 1
        `,
      )
      .get(managedFolder.id) as CountRow;

    return {
      fileCount: row.fileCount,
      lastScannedAt: managedFolder.lastScannedAt,
      uniqueVideoCount: row.uniqueVideoCount,
    };
  }

  public getVideoFileCache(): ScannedVideoFile[] {
    const managedFolder = this.getActiveManagedFolder();
    if (!managedFolder) {
      return [];
    }

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
          WHERE managed_folder_id = ? AND is_present = 1
          ORDER BY relative_path
        `,
      )
      .all(managedFolder.id) as ScannedVideoFile[];
  }

  public getLibraryVideoCount(query: LibraryVideoQuery = ALL_LIBRARY_VIDEOS_QUERY): number {
    const managedFolder = this.getActiveManagedFolder();
    if (!managedFolder) {
      return 0;
    }

    const queryParts = getLibraryVideoQueryParts(query);
    const row = this.database
      .prepare(
        `
          WITH ranked_files AS (
            SELECT
              content_hash AS contentHash,
              file_name AS fileName,
              modified_at_ms AS modifiedAtMs,
              relative_path AS relativePath,
              size_bytes AS sizeBytes,
              ROW_NUMBER() OVER (
                PARTITION BY content_hash
                ORDER BY modified_at_ms DESC, relative_path COLLATE NOCASE, relative_path
              ) AS position
            FROM video_files
            WHERE managed_folder_id = ? AND is_present = 1
          )
          SELECT COUNT(*) AS totalItems
          FROM ranked_files
          JOIN videos ON videos.content_hash = ranked_files.contentHash
          WHERE
            ranked_files.position = 1
            AND ${queryParts.dateColumn} BETWEEN ? AND ?
            AND (
              ? = ''
              OR EXISTS (
                SELECT 1
                FROM video_files AS matching_files
                WHERE
                  matching_files.managed_folder_id = ?
                  AND matching_files.is_present = 1
                  AND matching_files.content_hash = ranked_files.contentHash
                  AND instr(normalize_search_text(matching_files.file_name), ?) > 0
              )
            )
            AND (
              ? IS NULL
              OR EXISTS (
                SELECT 1
                FROM video_tags
                WHERE
                  video_tags.content_hash = ranked_files.contentHash
                  AND video_tags.tag_id = ?
              )
            )
        `,
      )
      .get(
        managedFolder.id,
        queryParts.dateFrom,
        queryParts.dateTo,
        queryParts.normalizedSearchQuery,
        managedFolder.id,
        queryParts.normalizedSearchQuery,
        query.tagId,
        query.tagId,
      ) as TotalRow;

    return row.totalItems;
  }

  public getLibraryVideos(
    limit: number,
    offset: number,
    query: LibraryVideoQuery = ALL_LIBRARY_VIDEOS_QUERY,
  ): LibraryVideo[] {
    const managedFolder = this.getActiveManagedFolder();
    if (!managedFolder) {
      return [];
    }

    const queryParts = getLibraryVideoQueryParts(query);
    const rows = this.database
      .prepare(
        `
          WITH ranked_files AS (
            SELECT
              content_hash AS contentHash,
              file_name AS fileName,
              modified_at_ms AS modifiedAtMs,
              relative_path AS relativePath,
              size_bytes AS sizeBytes,
              ROW_NUMBER() OVER (
                PARTITION BY content_hash
                ORDER BY modified_at_ms DESC, relative_path COLLATE NOCASE, relative_path
              ) AS position
            FROM video_files
            WHERE managed_folder_id = ? AND is_present = 1
          )
          SELECT
            ranked_files.contentHash,
            ranked_files.fileName,
            video_metadata.updated_at AS metadataUpdatedAt,
            ranked_files.modifiedAtMs,
            videos.created_at AS registeredAt,
            ranked_files.relativePath,
            ranked_files.sizeBytes
          FROM ranked_files
          JOIN videos ON videos.content_hash = ranked_files.contentHash
          LEFT JOIN video_metadata
            ON video_metadata.content_hash = ranked_files.contentHash
          WHERE
            ranked_files.position = 1
            AND ${queryParts.dateColumn} BETWEEN ? AND ?
            AND (
              ? = ''
              OR EXISTS (
                SELECT 1
                FROM video_files AS matching_files
                WHERE
                  matching_files.managed_folder_id = ?
                  AND matching_files.is_present = 1
                  AND matching_files.content_hash = ranked_files.contentHash
                  AND instr(normalize_search_text(matching_files.file_name), ?) > 0
              )
            )
            AND (
              ? IS NULL
              OR EXISTS (
                SELECT 1
                FROM video_tags
                WHERE
                  video_tags.content_hash = ranked_files.contentHash
                  AND video_tags.tag_id = ?
              )
            )
          ORDER BY
            ${queryParts.orderBy},
            ranked_files.fileName COLLATE NOCASE,
            ranked_files.relativePath
          LIMIT ? OFFSET ?
        `,
      )
      .all(
        managedFolder.id,
        queryParts.dateFrom,
        queryParts.dateTo,
        queryParts.normalizedSearchQuery,
        managedFolder.id,
        queryParts.normalizedSearchQuery,
        query.tagId,
        query.tagId,
        limit,
        offset,
      ) as LibraryVideoRow[];

    return rows.map((row) => ({
      ...row,
      metadataRegistered: row.metadataUpdatedAt !== null,
    }));
  }

  public getLibraryVideoByHash(contentHash: string): LibraryVideo | null {
    const managedFolder = this.getActiveManagedFolder();
    if (!managedFolder) {
      return null;
    }

    const row = this.database
      .prepare(
        `
          SELECT
            video_files.content_hash AS contentHash,
            video_files.file_name AS fileName,
            video_metadata.updated_at AS metadataUpdatedAt,
            video_files.modified_at_ms AS modifiedAtMs,
            videos.created_at AS registeredAt,
            video_files.relative_path AS relativePath,
            video_files.size_bytes AS sizeBytes
          FROM video_files
          JOIN videos ON videos.content_hash = video_files.content_hash
          LEFT JOIN video_metadata
            ON video_metadata.content_hash = video_files.content_hash
          WHERE
            video_files.managed_folder_id = ?
            AND video_files.content_hash = ?
            AND video_files.is_present = 1
          ORDER BY
            video_files.modified_at_ms DESC,
            video_files.relative_path COLLATE NOCASE,
            video_files.relative_path
          LIMIT 1
        `,
      )
      .get(managedFolder.id, contentHash) as LibraryVideoRow | undefined;

    return row
      ? {
          ...row,
          metadataRegistered: row.metadataUpdatedAt !== null,
        }
      : null;
  }

  public getTags(): ManagedVideoTag[] {
    return this.database
      .prepare(
        `
          SELECT
            tags.id,
            tags.name,
            COUNT(video_tags.content_hash) AS videoCount
          FROM tags
          LEFT JOIN video_tags ON video_tags.tag_id = tags.id
          GROUP BY tags.id, tags.name
          ORDER BY tags.normalized_name, tags.name, tags.id
        `,
      )
      .all() as ManagedVideoTagRow[];
  }

  public createVideoTag(value: string): ManagedVideoTag {
    const { name, normalizedName } = normalizeTagName(value);
    const duplicate = this.database
      .prepare('SELECT 1 AS found FROM tags WHERE normalized_name = ?')
      .get(normalizedName) as TagExistsRow | undefined;
    if (duplicate) {
      throw new Error('A tag with this name already exists.');
    }

    const createdAt = new Date().toISOString();
    const result = this.database
      .prepare(
        `
          INSERT INTO tags (name, normalized_name, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(name, normalizedName, createdAt, createdAt);

    return { id: Number(result.lastInsertRowid), name, videoCount: 0 };
  }

  public renameVideoTag(tagId: number, value: string): ManagedVideoTag {
    this.assertTagExists(tagId);
    const { name, normalizedName } = normalizeTagName(value);
    const duplicate = this.database
      .prepare('SELECT id FROM tags WHERE normalized_name = ? AND id <> ?')
      .get(normalizedName, tagId) as TagIdRow | undefined;
    if (duplicate) {
      throw new Error('A tag with this name already exists.');
    }

    this.database
      .prepare(
        `
          UPDATE tags
          SET name = ?, normalized_name = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .run(name, normalizedName, new Date().toISOString(), tagId);
    const row = this.database
      .prepare('SELECT COUNT(*) AS videoCount FROM video_tags WHERE tag_id = ?')
      .get(tagId) as VideoCountRow;

    return { id: tagId, name, videoCount: row.videoCount };
  }

  public deleteVideoTag(tagId: number): void {
    this.assertTagExists(tagId);
    this.database.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
  }

  public getVideoTags(contentHash: string): VideoTag[] {
    this.assertVideoExists(contentHash);
    return this.database
      .prepare(
        `
          SELECT tags.id, tags.name
          FROM video_tags
          JOIN tags ON tags.id = video_tags.tag_id
          WHERE video_tags.content_hash = ?
          ORDER BY tags.normalized_name, tags.name, tags.id
        `,
      )
      .all(contentHash) as VideoTagRow[];
  }

  public setVideoTags(contentHash: string, tagIds: readonly number[]): VideoTag[] {
    this.assertVideoExists(contentHash);
    if (
      tagIds.some((tagId) => !Number.isSafeInteger(tagId) || tagId <= 0) ||
      new Set(tagIds).size !== tagIds.length
    ) {
      throw new Error('Invalid video tag IDs.');
    }

    if (tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(', ');
      const existingTagIds = this.database
        .prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
        .all(...tagIds) as TagIdRow[];
      if (existingTagIds.length !== tagIds.length) {
        throw new Error('Tag not found.');
      }
    }

    const assignedAt = new Date().toISOString();
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM video_tags WHERE content_hash = ?').run(contentHash);
      const insert = this.database.prepare(
        'INSERT INTO video_tags (content_hash, tag_id, created_at) VALUES (?, ?, ?)',
      );
      for (const tagId of tagIds) {
        insert.run(contentHash, tagId, assignedAt);
      }
    })();

    return this.getVideoTags(contentHash);
  }

  public getVideoMetadata(contentHash: string): VideoMetadataDetail {
    this.assertVideoExists(contentHash);
    const current = this.database
      .prepare(
        `
          SELECT
            source_caption AS sourceCaption,
            source_url AS sourceUrl,
            updated_at AS updatedAt
          FROM video_metadata
          WHERE content_hash = ?
        `,
      )
      .get(contentHash) as VideoMetadataSnapshot | undefined;
    const revisions = this.database
      .prepare(
        `
          SELECT
            id,
            copied_from_content_hash AS copiedFromContentHash,
            source_caption AS sourceCaption,
            source_url AS sourceUrl,
            created_at AS createdAt
          FROM video_metadata_revisions
          WHERE content_hash = ?
          ORDER BY id DESC
        `,
      )
      .all(contentHash) as VideoMetadataRevision[];

    return {
      contentHash,
      current: current ?? null,
      revisions,
    };
  }

  public searchVideoMetadata(query: string, excludeContentHash: string): MetadataSearchRecord[] {
    const normalizedQuery = normalizeSearchText(query);
    const rows = this.database
      .prepare(
        `
          WITH ranked_locations AS (
            SELECT
              content_hash AS contentHash,
              file_name AS fileName,
              ROW_NUMBER() OVER (
                PARTITION BY content_hash
                ORDER BY is_present DESC, last_seen_at DESC, id DESC
              ) AS position
            FROM video_files
          ),
          file_states AS (
            SELECT content_hash AS contentHash, MAX(is_present) AS filePresent
            FROM video_files
            GROUP BY content_hash
          )
          SELECT
            videos.content_hash AS contentHash,
            COALESCE(ranked_locations.fileName, '알 수 없는 영상') AS fileName,
            COALESCE(file_states.filePresent, 0) AS filePresent,
            videos.created_at AS registeredAt,
            video_metadata.source_caption AS sourceCaption,
            video_metadata.source_url AS sourceUrl
          FROM videos
          JOIN video_metadata ON video_metadata.content_hash = videos.content_hash
          LEFT JOIN ranked_locations
            ON ranked_locations.contentHash = videos.content_hash
            AND ranked_locations.position = 1
          LEFT JOIN file_states ON file_states.contentHash = videos.content_hash
          WHERE
            videos.content_hash <> ?
            AND (
              instr(normalize_search_text(videos.content_hash), ?) > 0
              OR instr(normalize_search_text(video_metadata.source_caption), ?) > 0
              OR instr(normalize_search_text(video_metadata.source_url), ?) > 0
              OR EXISTS (
                SELECT 1
                FROM video_files AS matching_files
                WHERE
                  matching_files.content_hash = videos.content_hash
                  AND instr(normalize_search_text(matching_files.file_name), ?) > 0
              )
            )
          ORDER BY filePresent DESC, videos.created_at DESC, fileName COLLATE NOCASE
          LIMIT ?
        `,
      )
      .all(
        excludeContentHash,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        METADATA_SEARCH_LIMIT,
      ) as MetadataSearchRow[];

    return rows.map((row) => ({
      ...row,
      filePresent: row.filePresent === 1,
    }));
  }

  public saveVideoMetadata(
    contentHash: string,
    input: VideoMetadataInput,
    copiedFromContentHash: string | null = null,
  ): VideoMetadataDetail {
    this.assertVideoExists(contentHash);
    if (copiedFromContentHash) {
      if (copiedFromContentHash === contentHash) {
        throw new Error('A video cannot copy metadata from itself.');
      }
      this.assertVideoExists(copiedFromContentHash);
    }

    const existing = this.database
      .prepare(
        `
          SELECT
            source_caption AS sourceCaption,
            source_url AS sourceUrl,
            updated_at AS updatedAt
          FROM video_metadata
          WHERE content_hash = ?
        `,
      )
      .get(contentHash) as VideoMetadataSnapshot | undefined;

    if (existing?.sourceCaption === input.sourceCaption && existing.sourceUrl === input.sourceUrl) {
      return this.getVideoMetadata(contentHash);
    }

    const savedAt = new Date().toISOString();
    this.database.transaction(() => {
      this.database
        .prepare(
          `
            INSERT INTO video_metadata (
              content_hash,
              source_url,
              source_caption,
              updated_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(content_hash) DO UPDATE SET
              source_url = excluded.source_url,
              source_caption = excluded.source_caption,
              updated_at = excluded.updated_at
          `,
        )
        .run(contentHash, input.sourceUrl, input.sourceCaption, savedAt);
      this.database
        .prepare(
          `
            INSERT INTO video_metadata_revisions (
              content_hash,
              source_url,
              source_caption,
              copied_from_content_hash,
              created_at
            ) VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(contentHash, input.sourceUrl, input.sourceCaption, copiedFromContentHash, savedAt);
    })();

    return this.getVideoMetadata(contentHash);
  }

  public syncVideoFiles(
    files: readonly ScannedVideoFile[],
    scanCounts: Pick<VideoScanSummary, 'hashedFileCount' | 'reusedHashCount'> &
      Partial<Pick<VideoScanSummary, 'excludedDirectoryCount'>>,
  ): VideoScanSummary {
    const managedFolder = this.getActiveManagedFolder();
    if (!managedFolder) {
      throw new Error('No managed folder is selected.');
    }

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
          .prepare(
            `
              SELECT relative_path AS relativePath
              FROM video_files
              WHERE managed_folder_id = ? AND is_present = 1
            `,
          )
          .all(managedFolder.id) as RelativePathRow[]
      ).map((row) => row.relativePath),
    );
    const currentHashes = new Set(files.map((file) => file.contentHash));
    const currentPaths = new Set(files.map((file) => file.relativePath));
    const scannedAt = new Date().toISOString();

    const insertVideo = this.database.prepare(
      'INSERT OR IGNORE INTO videos (content_hash, created_at) VALUES (?, ?)',
    );
    const upsertFile = this.database.prepare(`
      INSERT INTO video_files (
        managed_folder_id,
        relative_path,
        content_hash,
        file_name,
        size_bytes,
        modified_at_ms,
        first_seen_at,
        last_seen_at,
        is_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(managed_folder_id, relative_path, content_hash) DO UPDATE SET
        file_name = excluded.file_name,
        size_bytes = excluded.size_bytes,
        modified_at_ms = excluded.modified_at_ms,
        last_seen_at = excluded.last_seen_at,
        is_present = 1
    `);

    this.database.transaction(() => {
      for (const file of files) {
        insertVideo.run(file.contentHash, scannedAt);
      }

      this.database
        .prepare(
          `
            UPDATE video_files
            SET is_present = 0
            WHERE managed_folder_id = ? AND is_present = 1
          `,
        )
        .run(managedFolder.id);

      for (const file of files) {
        upsertFile.run(
          managedFolder.id,
          file.relativePath,
          file.contentHash,
          file.fileName,
          file.sizeBytes,
          file.modifiedAtMs,
          scannedAt,
          scannedAt,
        );
      }

      this.database
        .prepare('UPDATE managed_folders SET last_scanned_at = ? WHERE id = ?')
        .run(scannedAt, managedFolder.id);
    })();

    return {
      addedVideoCount: [...currentHashes].filter((hash) => !existingHashes.has(hash)).length,
      duplicateFileCount: files.length - currentHashes.size,
      excludedDirectoryCount: scanCounts.excludedDirectoryCount ?? 0,
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

  public async createBackup(destinationPath: string, appVersion: string): Promise<void> {
    const resolvedDestination = resolve(destinationPath);
    if (databasePathsMatch(this.databasePath, resolvedDestination)) {
      throw new Error('The active database cannot be used as its own backup destination.');
    }

    const temporaryDestination = `${resolvedDestination}.${randomUUID()}.tmp`;
    prepareBackupDestination(temporaryDestination);
    try {
      await this.database.backup(temporaryDestination);

      const backupDatabase = new Database(temporaryDestination);
      try {
        backupDatabase
          .prepare(
            `
              INSERT INTO backup_manifest (
                id,
                app_version,
                schema_version,
                created_at
              ) VALUES (1, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                app_version = excluded.app_version,
                schema_version = excluded.schema_version,
                created_at = excluded.created_at
            `,
          )
          .run(appVersion, DATABASE_SCHEMA_VERSION, new Date().toISOString());
      } finally {
        backupDatabase.close();
      }

      validateBackupDatabase(temporaryDestination);
      removeExactFileIfPresent(`${resolvedDestination}-shm`);
      removeExactFileIfPresent(`${resolvedDestination}-wal`);
      renameSync(temporaryDestination, resolvedDestination);
    } catch (error) {
      removeExactFileIfPresent(temporaryDestination);
      throw error;
    } finally {
      removeExactFileIfPresent(`${temporaryDestination}-shm`);
      removeExactFileIfPresent(`${temporaryDestination}-wal`);
    }
  }

  public async stageBackupRestore(
    sourcePath: string,
    pendingRestorePath: string,
    automaticBackupPath: string,
    appVersion: string,
  ): Promise<void> {
    const resolvedSource = resolve(sourcePath);
    const resolvedPending = resolve(pendingRestorePath);
    const resolvedAutomaticBackup = resolve(automaticBackupPath);
    if (
      databasePathsMatch(this.databasePath, resolvedSource) ||
      databasePathsMatch(this.databasePath, resolvedPending) ||
      databasePathsMatch(this.databasePath, resolvedAutomaticBackup) ||
      databasePathsMatch(resolvedSource, resolvedPending)
    ) {
      throw new Error('Invalid database restore path.');
    }

    validateBackupDatabase(resolvedSource);
    await this.createBackup(resolvedAutomaticBackup, appVersion);
    prepareBackupDestination(resolvedPending);

    const sourceDatabase = new Database(resolvedSource, { fileMustExist: true, readonly: true });
    try {
      await sourceDatabase.backup(resolvedPending);
    } catch (error) {
      removeExactFileIfPresent(resolvedPending);
      throw error;
    } finally {
      sourceDatabase.close();
    }

    validateBackupDatabase(resolvedPending);
    this.database.pragma('wal_checkpoint(TRUNCATE)');
  }

  private migrate(): void {
    this.database.pragma(`application_id = ${DATABASE_APPLICATION_ID}`);
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

      CREATE TABLE IF NOT EXISTS managed_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root_path TEXT NOT NULL,
        normalized_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_scanned_at TEXT
      );

      CREATE TABLE IF NOT EXISTS video_metadata (
        content_hash TEXT PRIMARY KEY REFERENCES videos(content_hash),
        source_url TEXT,
        source_caption TEXT,
        updated_at TEXT NOT NULL,
        CHECK (source_url IS NOT NULL OR source_caption IS NOT NULL)
      );

      CREATE TABLE IF NOT EXISTS video_metadata_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash TEXT NOT NULL REFERENCES videos(content_hash),
        source_url TEXT,
        source_caption TEXT,
        copied_from_content_hash TEXT REFERENCES videos(content_hash),
        created_at TEXT NOT NULL,
        CHECK (source_url IS NOT NULL OR source_caption IS NOT NULL)
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS video_tags (
        content_hash TEXT NOT NULL REFERENCES videos(content_hash) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY(content_hash, tag_id)
      );

      CREATE TABLE IF NOT EXISTS backup_manifest (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        app_version TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const legacyRoot = this.getSetting(LEGACY_LIBRARY_ROOT_KEY);
    const legacyLastScannedAt = this.getSetting(LEGACY_LAST_SCANNED_AT_KEY);
    const legacyFolderId = legacyRoot
      ? this.getOrCreateManagedFolder(legacyRoot, legacyLastScannedAt)
      : null;

    if (!this.tableExists('video_files')) {
      this.createVideoFilesTable();
    } else if (!this.columnExists('video_files', 'managed_folder_id')) {
      this.migrateLegacyVideoFiles(legacyFolderId);
    }

    if (!this.columnExists('video_metadata_revisions', 'copied_from_content_hash')) {
      this.database.exec(`
        ALTER TABLE video_metadata_revisions
        ADD COLUMN copied_from_content_hash TEXT REFERENCES videos(content_hash)
      `);
    }

    this.createIndexes();

    if (!this.getActiveManagedFolder() && legacyFolderId) {
      this.setSetting(ACTIVE_MANAGED_FOLDER_ID_KEY, String(legacyFolderId));
    }
    this.deleteSetting(LEGACY_LIBRARY_ROOT_KEY);
    this.deleteSetting(LEGACY_LAST_SCANNED_AT_KEY);
    this.database.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
  }

  private migrateLegacyVideoFiles(managedFolderId: number | null): void {
    this.database.transaction(() => {
      this.database.exec('ALTER TABLE video_files RENAME TO video_files_legacy');
      this.createVideoFilesTable();

      if (managedFolderId) {
        this.database
          .prepare(
            `
              INSERT INTO video_files (
                managed_folder_id,
                relative_path,
                content_hash,
                file_name,
                size_bytes,
                modified_at_ms,
                first_seen_at,
                last_seen_at,
                is_present
              )
              SELECT
                ?,
                legacy.relative_path,
                legacy.content_hash,
                legacy.file_name,
                legacy.size_bytes,
                legacy.modified_at_ms,
                videos.created_at,
                legacy.updated_at,
                1
              FROM video_files_legacy AS legacy
              JOIN videos ON videos.content_hash = legacy.content_hash
            `,
          )
          .run(managedFolderId);
      }

      this.database.exec('DROP TABLE video_files_legacy');
    })();
  }

  private createVideoFilesTable(): void {
    this.database.exec(`
      CREATE TABLE video_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        managed_folder_id INTEGER NOT NULL REFERENCES managed_folders(id),
        relative_path TEXT NOT NULL,
        content_hash TEXT NOT NULL REFERENCES videos(content_hash),
        file_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        modified_at_ms INTEGER NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        is_present INTEGER NOT NULL CHECK (is_present IN (0, 1)),
        UNIQUE(managed_folder_id, relative_path, content_hash)
      )
    `);
  }

  private createIndexes(): void {
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS video_files_content_hash_idx
      ON video_files(content_hash);

      CREATE INDEX IF NOT EXISTS video_files_managed_folder_present_idx
      ON video_files(managed_folder_id, is_present);

      CREATE UNIQUE INDEX IF NOT EXISTS video_files_current_path_idx
      ON video_files(managed_folder_id, relative_path)
      WHERE is_present = 1;

      CREATE INDEX IF NOT EXISTS video_metadata_revisions_content_hash_idx
      ON video_metadata_revisions(content_hash, id DESC);

      CREATE INDEX IF NOT EXISTS video_tags_tag_id_idx
      ON video_tags(tag_id, content_hash);
    `);
  }

  private getOrCreateManagedFolder(rootPath: string, lastScannedAt: string | null = null): number {
    const normalized = normalizeLibraryRoot(rootPath);
    const existing = this.database
      .prepare('SELECT id FROM managed_folders WHERE normalized_path = ?')
      .get(normalized.normalizedPath) as Pick<ManagedFolderRow, 'id'> | undefined;

    if (existing) {
      this.database
        .prepare(
          `
            UPDATE managed_folders
            SET
              root_path = ?,
              last_scanned_at = COALESCE(last_scanned_at, ?)
            WHERE id = ?
          `,
        )
        .run(normalized.rootPath, lastScannedAt, existing.id);
      return existing.id;
    }

    const result = this.database
      .prepare(
        `
          INSERT INTO managed_folders (
            root_path,
            normalized_path,
            created_at,
            last_scanned_at
          ) VALUES (?, ?, ?, ?)
        `,
      )
      .run(normalized.rootPath, normalized.normalizedPath, new Date().toISOString(), lastScannedAt);
    return Number(result.lastInsertRowid);
  }

  private getActiveManagedFolder(): ManagedFolderRow | null {
    const folderId = Number(this.getSetting(ACTIVE_MANAGED_FOLDER_ID_KEY));
    if (!Number.isSafeInteger(folderId) || folderId <= 0) {
      return null;
    }

    const row = this.database
      .prepare(
        `
          SELECT
            id,
            root_path AS rootPath,
            last_scanned_at AS lastScannedAt
          FROM managed_folders
          WHERE id = ?
        `,
      )
      .get(folderId) as ManagedFolderRow | undefined;
    return row ?? null;
  }

  private tableExists(tableName: string): boolean {
    return Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(tableName),
    );
  }

  private columnExists(tableName: string, columnName: string): boolean {
    const columns = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as TableInfoRow[];
    return columns.some((column) => column.name === columnName);
  }

  private assertVideoExists(contentHash: string): void {
    const row = this.database
      .prepare('SELECT 1 AS found FROM videos WHERE content_hash = ?')
      .get(contentHash) as VideoExistsRow | undefined;

    if (!row) {
      throw new Error('Video not found.');
    }
  }

  private assertTagExists(tagId: number): void {
    const row = this.database.prepare('SELECT 1 AS found FROM tags WHERE id = ?').get(tagId) as
      TagExistsRow | undefined;

    if (!row) {
      throw new Error('Tag not found.');
    }
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
