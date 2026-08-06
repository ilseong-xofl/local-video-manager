export const IPC_CHANNELS = {
  getBootstrapState: 'app:get-bootstrap-state',
  chooseLibraryRoot: 'library:choose-root',
  getLibraryVideoPage: 'library:get-video-page',
  scanLibrary: 'library:scan',
} as const;

export interface LibraryStats {
  fileCount: number;
  lastScannedAt: string | null;
  uniqueVideoCount: number;
}

export interface VideoScanSummary extends LibraryStats {
  addedVideoCount: number;
  duplicateFileCount: number;
  hashedFileCount: number;
  removedFileCount: number;
  reusedHashCount: number;
}

export interface LibraryVideo {
  contentHash: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
}

export interface LibraryVideoItem extends LibraryVideo {
  fileAvailable: boolean;
  playbackUrl: string | null;
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

export interface ScanLibraryResult {
  state: BootstrapState;
  summary: VideoScanSummary;
}

export interface LocalVideoManagerApi {
  getBootstrapState(): Promise<BootstrapState>;
  chooseLibraryRoot(): Promise<ChooseLibraryRootResult>;
  getLibraryVideoPage(pageIndex: number): Promise<LibraryVideoPage>;
  scanLibrary(): Promise<ScanLibraryResult>;
}
