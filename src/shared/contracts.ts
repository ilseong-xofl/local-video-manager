export const IPC_CHANNELS = {
  getBootstrapState: 'app:get-bootstrap-state',
  createDatabaseBackup: 'database:create-backup',
  restoreDatabaseBackup: 'database:restore-backup',
  chooseLibraryRoot: 'library:choose-root',
  getLibraryVideoPage: 'library:get-video-page',
  getTags: 'tags:get-all',
  createTag: 'tags:create',
  renameTag: 'tags:rename',
  deleteTag: 'tags:delete',
  setVideoTags: 'tags:set-for-video',
  setVideoReaction: 'library:set-video-reaction',
  getVideoMetadata: 'library:get-video-metadata',
  searchVideoMetadata: 'library:search-video-metadata',
  saveVideoMetadata: 'library:save-video-metadata',
  scanLibrary: 'library:scan',
} as const;

export const VIDEO_SOURCE_URL_MAX_LENGTH = 2_048;
export const VIDEO_SOURCE_CAPTION_MAX_LENGTH = 50_000;
export const VIDEO_METADATA_SEARCH_MAX_LENGTH = 200;
export const VIDEO_LIBRARY_SEARCH_MAX_LENGTH = 200;
export const VIDEO_TAG_NAME_MAX_LENGTH = 40;

export type LibraryVideoSortDirection = 'asc' | 'desc';
export type LibraryVideoSortField = 'modifiedAt' | 'registeredAt';
export type VideoReaction = 'hype' | 'unhype';
export type LibraryVideoReactionFilter = VideoReaction | 'none';

export interface LibraryVideoQuery {
  dateFromMs: number;
  dateToMs: number;
  searchQuery: string;
  reaction: LibraryVideoReactionFilter | null;
  sortDirection: LibraryVideoSortDirection;
  sortField: LibraryVideoSortField;
  tagId: number | null;
}

export interface VideoTag {
  id: number;
  name: string;
}

export interface ManagedVideoTag extends VideoTag {
  videoCount: number;
}

export interface LibraryStats {
  fileCount: number;
  lastScannedAt: string | null;
  uniqueVideoCount: number;
}

export interface VideoScanSummary extends LibraryStats {
  addedVideoCount: number;
  duplicateFileCount: number;
  excludedDirectoryCount: number;
  hashedFileCount: number;
  removedFileCount: number;
  reusedHashCount: number;
}

export interface LibraryVideo {
  contentHash: string;
  fileName: string;
  metadataRegistered: boolean;
  metadataUpdatedAt: string | null;
  modifiedAtMs: number;
  reaction: VideoReaction | null;
  registeredAt: string;
  relativePath: string;
  sizeBytes: number;
}

export interface LibraryVideoItem extends LibraryVideo {
  fileAvailable: boolean;
  playbackUrl: string | null;
  tags: VideoTag[];
  thumbnailDataUrl: string | null;
}

export interface LibraryVideoPage {
  items: LibraryVideoItem[];
  pageIndex: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BootstrapState {
  appVersion: string;
  libraryId: string;
  libraryRoot: string | null;
  libraryRootAvailable: boolean;
  libraryStats: LibraryStats;
  platform: NodeJS.Platform;
}

export interface ChooseLibraryRootResult {
  cancelled: boolean;
  state: BootstrapState;
}

export interface DatabaseBackupResult {
  cancelled: boolean;
  filePath: string | null;
}

export interface DatabaseRestoreResult {
  automaticBackupPath: string | null;
  cancelled: boolean;
}

export interface ScanLibraryResult {
  state: BootstrapState;
  summary: VideoScanSummary;
}

export interface VideoMetadataInput {
  sourceCaption: string | null;
  sourceUrl: string | null;
}

export interface VideoMetadataSnapshot extends VideoMetadataInput {
  updatedAt: string;
}

export interface VideoMetadataRevision extends VideoMetadataInput {
  copiedFromContentHash: string | null;
  createdAt: string;
  id: number;
}

export interface VideoMetadataDetail {
  contentHash: string;
  current: VideoMetadataSnapshot | null;
  revisions: VideoMetadataRevision[];
}

export interface VideoMetadataSearchResult extends VideoMetadataInput {
  contentHash: string;
  fileName: string;
  filePresent: boolean;
  registeredAt: string;
  thumbnailDataUrl: string | null;
}

export interface LocalVideoManagerApi {
  getBootstrapState(): Promise<BootstrapState>;
  createDatabaseBackup(): Promise<DatabaseBackupResult>;
  restoreDatabaseBackup(): Promise<DatabaseRestoreResult>;
  chooseLibraryRoot(): Promise<ChooseLibraryRootResult>;
  getTags(): Promise<ManagedVideoTag[]>;
  createTag(name: string): Promise<ManagedVideoTag>;
  renameTag(id: number, name: string): Promise<ManagedVideoTag>;
  deleteTag(id: number): Promise<void>;
  setVideoTags(contentHash: string, tagIds: number[]): Promise<VideoTag[]>;
  setVideoReaction(
    contentHash: string,
    reaction: VideoReaction | null,
  ): Promise<VideoReaction | null>;
  getLibraryVideoPage(pageIndex: number, query: LibraryVideoQuery): Promise<LibraryVideoPage>;
  getVideoMetadata(contentHash: string): Promise<VideoMetadataDetail>;
  searchVideoMetadata(
    query: string,
    excludeContentHash: string,
  ): Promise<VideoMetadataSearchResult[]>;
  saveVideoMetadata(
    contentHash: string,
    input: VideoMetadataInput,
    copiedFromContentHash?: string | null,
  ): Promise<VideoMetadataDetail>;
  scanLibrary(): Promise<ScanLibraryResult>;
}
