export const IPC_CHANNELS = {
  getBootstrapState: 'app:get-bootstrap-state',
  createDatabaseBackup: 'database:create-backup',
  restoreDatabaseBackup: 'database:restore-backup',
  chooseLibraryRoot: 'library:choose-root',
  getLibraryVideoPage: 'library:get-video-page',
  openVideoSourceUrl: 'library:open-source-url',
  revealVideoFile: 'library:reveal-video-file',
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
  getVideoEditorPresets: 'video-editor:get-presets',
  createVideoEditorPreset: 'video-editor:create-preset',
  updateVideoEditorPreset: 'video-editor:update-preset',
  deleteVideoEditorPreset: 'video-editor:delete-preset',
  startVideoRender: 'video-editor:start-render',
  cancelVideoRender: 'video-editor:cancel-render',
  revealRenderedVideo: 'video-editor:reveal-rendered-video',
  videoRenderProgress: 'video-editor:render-progress',
} as const;

export const VIDEO_SOURCE_URL_MAX_LENGTH = 2_048;
export const VIDEO_SOURCE_CAPTION_MAX_LENGTH = 50_000;
export const VIDEO_METADATA_SEARCH_MAX_LENGTH = 200;
export const VIDEO_LIBRARY_SEARCH_MAX_LENGTH = 200;
export const VIDEO_TAG_NAME_MAX_LENGTH = 40;
export const VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH = 60;
export const VIDEO_EDITOR_OVERLAY_IMAGE_MAX_LENGTH = 30_000_000;

export const VIDEO_EDITOR_PLATFORM_RATIOS = {
  instagram: ['9:16', '4:5', '1:1', '1.91:1'],
  tiktok: ['9:16', '1:1', '4:5'],
  x: ['16:9', '1:1'],
} as const;

export const VIDEO_EDITOR_OUTPUT_SIZES = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '1.91:1': { width: 1080, height: 566 },
  '16:9': { width: 1920, height: 1080 },
} as const;

export type LibraryVideoSortDirection = 'asc' | 'desc';
export type LibraryVideoSortField = 'modifiedAt' | 'registeredAt';
export type VideoReaction = 'hype' | 'unhype';
export type LibraryVideoReactionFilter = VideoReaction | 'none';
export type VideoEditorPlatform = keyof typeof VIDEO_EDITOR_PLATFORM_RATIOS;
export type VideoEditorAspectRatio = keyof typeof VIDEO_EDITOR_OUTPUT_SIZES;
export type VideoEditorResizeMode = 'crop' | 'letterbox';
export type VideoEditorTextAlign = 'left' | 'center' | 'right';
export type VideoEditorFontWeight = 400 | 700 | 900;
export type VideoRenderStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface VideoEditorTextStyle {
  backgroundColor: string;
  backgroundOpacity: number;
  fontSizePercent: number;
  fontWeight: VideoEditorFontWeight;
  textAlign: VideoEditorTextAlign;
  textColor: string;
}

export interface VideoEditorPresetInput {
  aspectRatio: VideoEditorAspectRatio;
  defaultTextStyle: VideoEditorTextStyle;
  letterboxColor: string;
  name: string;
  platform: VideoEditorPlatform;
  resizeMode: VideoEditorResizeMode;
}

export interface VideoEditorPreset extends VideoEditorPresetInput {
  createdAt: string;
  id: number;
  updatedAt: string;
}

export interface VideoEditorRegion {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface VideoEditorTextOverlay {
  id: string;
  region: VideoEditorRegion;
  style: VideoEditorTextStyle;
  text: string;
}

export interface VideoRenderRequest {
  aspectRatio: VideoEditorAspectRatio;
  letterboxColor: string;
  overlayImageDataUrl: string | null;
  resizeMode: VideoEditorResizeMode;
}

export interface StartVideoRenderResult {
  cancelled: boolean;
  jobId: string | null;
  outputPath: string | null;
}

export interface VideoRenderProgress {
  errorMessage: string | null;
  jobId: string;
  outputPath: string;
  progress: number;
  status: VideoRenderStatus;
}

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
  sourceUrl: string | null;
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
  openVideoSourceUrl(contentHash: string): Promise<void>;
  revealVideoFile(contentHash: string): Promise<void>;
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
  getVideoEditorPresets(): Promise<VideoEditorPreset[]>;
  createVideoEditorPreset(input: VideoEditorPresetInput): Promise<VideoEditorPreset>;
  updateVideoEditorPreset(id: number, input: VideoEditorPresetInput): Promise<VideoEditorPreset>;
  deleteVideoEditorPreset(id: number): Promise<void>;
  startVideoRender(
    contentHash: string,
    request: VideoRenderRequest,
  ): Promise<StartVideoRenderResult>;
  cancelVideoRender(jobId: string): Promise<void>;
  revealRenderedVideo(jobId: string): Promise<void>;
  onVideoRenderProgress(listener: (progress: VideoRenderProgress) => void): () => void;
}
