export const IPC_CHANNELS = {
  getBootstrapState: 'app:get-bootstrap-state',
  chooseLibraryRoot: 'library:choose-root',
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
  scanLibrary(): Promise<ScanLibraryResult>;
}
