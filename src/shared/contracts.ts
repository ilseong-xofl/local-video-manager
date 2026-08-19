export const IPC_CHANNELS = {
  getAuthState: 'auth:get-state',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  quitApp: 'app:quit',
  authStateChanged: 'auth:state-changed',
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
  setVideoViewCount: 'library:set-video-view-count',
  getVideoMetadata: 'library:get-video-metadata',
  getVideoCaptionDrafts: 'video-caption:get-drafts',
  generateVideoCaption: 'video-caption:generate',
  saveVideoCaptionDraft: 'video-caption:save-draft',
  searchVideoMetadata: 'library:search-video-metadata',
  saveVideoMetadata: 'library:save-video-metadata',
  scanLibrary: 'library:scan',
  getVideoEditorPresets: 'video-editor:get-presets',
  createVideoEditorPreset: 'video-editor:create-preset',
  updateVideoEditorPreset: 'video-editor:update-preset',
  deleteVideoEditorPreset: 'video-editor:delete-preset',
  getVideoEditorTextPresets: 'video-editor:get-text-presets',
  createVideoEditorTextPreset: 'video-editor:create-text-preset',
  updateVideoEditorTextPreset: 'video-editor:update-text-preset',
  deleteVideoEditorTextPreset: 'video-editor:delete-text-preset',
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
export const VIDEO_EDITOR_TEXT_PRESET_LIMIT = 50;
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
export const VIDEO_CAPTION_DAILY_LIMIT = 10;
export const VIDEO_CAPTION_TARGET_LANGUAGES = ['ko', 'ja', 'en'] as const;
export type VideoCaptionTargetLanguage = (typeof VIDEO_CAPTION_TARGET_LANGUAGES)[number];
export const VIDEO_CAPTION_VARIATION_IDS = [1, 2, 3, 4] as const;
export type VideoCaptionVariationId = (typeof VIDEO_CAPTION_VARIATION_IDS)[number];
export const VIDEO_CAPTION_COPYWRITING_TYPES = ['field-report', 'calm-analyst'] as const;
export type VideoCaptionCopywritingType = (typeof VIDEO_CAPTION_COPYWRITING_TYPES)[number];
export type VideoEditorAspectRatio = keyof typeof VIDEO_EDITOR_OUTPUT_SIZES;
export type VideoEditorResizeMode = 'crop' | 'letterbox';
export type VideoEditorTextAlign = 'left' | 'center' | 'right';
export type VideoEditorFontWeight = 400 | 700 | 900;
export type VideoEditorFontMarket = 'KR' | 'JP' | 'US';
export type VideoRenderStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface VideoEditorFontOption {
  label: string;
  value: string;
}

export const VIDEO_EDITOR_FONT_MARKET_LABELS: Record<VideoEditorFontMarket, string> = {
  KR: '한국',
  JP: '일본',
  US: '미국',
};

export const VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET: Record<
  VideoEditorFontMarket,
  readonly VideoEditorFontOption[]
> = {
  KR: [
    { label: '기본', value: 'Noto Sans KR' },
    { label: '임팩트', value: 'Black Han Sans' },
    { label: '둥근 제목', value: 'Jua' },
    { label: '각진 고딕', value: 'Do Hyeon' },
    { label: '포인트', value: 'Gugi' },
    { label: '손글씨', value: 'Nanum Pen Script' },
    { label: '본문형', value: 'Nanum Gothic' },
    { label: '라운드', value: 'Sunflower' },
    { label: '손맛', value: 'Gamja Flower' },
    { label: '붓글씨', value: 'Yeon Sung' },
    { label: '고딕 A1', value: 'Gothic A1' },
    { label: '귀여운', value: 'Cute Font' },
    { label: '두꺼운 포인트', value: 'Bagel Fat One' },
    { label: '가벼운', value: 'Hi Melody' },
    { label: '개성', value: 'East Sea Dokdo' },
  ],
  JP: [
    { label: '기본', value: 'Noto Sans JP' },
    { label: 'M PLUS Rounded', value: 'M PLUS Rounded 1c' },
    { label: 'Kosugi Maru', value: 'Kosugi Maru' },
    { label: 'ポップ', value: 'Yusei Magic' },
    { label: 'ロック', value: 'RocknRoll One' },
    { label: 'レトロ', value: 'Reggae One' },
    { label: 'ドット', value: 'DotGothic16' },
    { label: 'ゴシック', value: 'Zen Kaku Gothic New' },
  ],
  US: [
    { label: 'Montserrat', value: 'Montserrat' },
    { label: 'Anton', value: 'Anton' },
    { label: 'Bebas Neue', value: 'Bebas Neue' },
    { label: 'Oswald', value: 'Oswald' },
    { label: 'Archivo Black', value: 'Archivo Black' },
    { label: 'Rubik', value: 'Rubik' },
    { label: 'Fredoka', value: 'Fredoka' },
    { label: 'Bangers', value: 'Bangers' },
    { label: 'Permanent Marker', value: 'Permanent Marker' },
    { label: 'Righteous', value: 'Righteous' },
  ],
};

export function getDefaultVideoEditorFontFamily(market: VideoEditorFontMarket): string {
  return VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET[market][0].value;
}

export function isVideoEditorFontFamily(
  market: VideoEditorFontMarket,
  fontFamily: string,
): boolean {
  return VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET[market].some((option) => option.value === fontFamily);
}

export interface VideoEditorTextStyle {
  backgroundColor: string;
  backgroundOpacity: number;
  fontFamily: string;
  fontMarket: VideoEditorFontMarket;
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

export interface VideoEditorTextPresetOverlay {
  region: VideoEditorRegion;
  style: VideoEditorTextStyle;
}

export interface VideoEditorTextPresetInput {
  name: string;
  overlays: VideoEditorTextPresetOverlay[];
}

export interface VideoEditorTextPreset extends VideoEditorTextPresetInput {
  createdAt: string;
  id: number;
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
  viewCount: number;
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

export interface VideoCaptionDraft {
  bottomText: string | null;
  caption: string;
  contentHash: string;
  copywritingType: VideoCaptionCopywritingType | null;
  createdAt: string;
  id: number;
  targetLanguage: VideoCaptionTargetLanguage;
  topText: string | null;
  variationId: VideoCaptionVariationId | null;
}

export interface VideoCaptionGenerationRequest {
  copywritingType: VideoCaptionCopywritingType;
  sourceCaption: string;
  targetLanguage: VideoCaptionTargetLanguage;
  variationId: VideoCaptionVariationId;
}

export interface VideoCaptionGenerationResult {
  bottomText: string;
  caption: string;
  topText: string;
}

export interface CaptionDailyUsage {
  limit: typeof VIDEO_CAPTION_DAILY_LIMIT;
  remaining: number;
  resetAt: string;
  timeZone: 'Asia/Seoul';
  used: number;
}

export interface VideoCaptionGenerationResponse extends VideoCaptionGenerationResult {
  dailyUsage: CaptionDailyUsage;
}

export interface AppAuthenticatedUser {
  displayName: string;
  email: string;
}

export type AppAuthState =
  | {
      status: 'authenticated';
      dailyUsage: CaptionDailyUsage;
      permissions: { caption: boolean };
      user: AppAuthenticatedUser;
    }
  | { status: 'signed-out' }
  | {
      status: 'blocked';
      reason: 'access' | 'configuration' | 'service';
      message: string;
    };

export interface LocalVideoManagerApi {
  getAuthState(): Promise<AppAuthState>;
  signIn(email: string, password: string): Promise<AppAuthState>;
  signOut(): Promise<AppAuthState>;
  quitApp(): Promise<void>;
  onAuthStateChanged(listener: (state: AppAuthState) => void): () => void;
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
  setVideoViewCount(contentHash: string, viewCount: number): Promise<number>;
  getLibraryVideoPage(pageIndex: number, query: LibraryVideoQuery): Promise<LibraryVideoPage>;
  openVideoSourceUrl(contentHash: string): Promise<void>;
  revealVideoFile(contentHash: string): Promise<void>;
  getVideoMetadata(contentHash: string): Promise<VideoMetadataDetail>;
  getVideoCaptionDrafts(contentHash: string): Promise<VideoCaptionDraft[]>;
  generateVideoCaption(
    request: VideoCaptionGenerationRequest,
  ): Promise<VideoCaptionGenerationResponse>;
  saveVideoCaptionDraft(
    contentHash: string,
    targetLanguage: VideoCaptionTargetLanguage,
    variationId: VideoCaptionVariationId,
    copywritingType: VideoCaptionCopywritingType,
    topText: string,
    bottomText: string,
    caption: string,
  ): Promise<VideoCaptionDraft>;
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
  getVideoEditorTextPresets(): Promise<VideoEditorTextPreset[]>;
  createVideoEditorTextPreset(input: VideoEditorTextPresetInput): Promise<VideoEditorTextPreset>;
  updateVideoEditorTextPreset(
    id: number,
    input: VideoEditorTextPresetInput,
  ): Promise<VideoEditorTextPreset>;
  deleteVideoEditorTextPreset(id: number): Promise<void>;
  startVideoRender(
    contentHash: string,
    request: VideoRenderRequest,
  ): Promise<StartVideoRenderResult>;
  cancelVideoRender(jobId: string): Promise<void>;
  revealRenderedVideo(jobId: string): Promise<void>;
  onVideoRenderProgress(listener: (progress: VideoRenderProgress) => void): () => void;
}
