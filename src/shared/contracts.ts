export const IPC_CHANNELS = {
  getBootstrapState: 'app:get-bootstrap-state',
  chooseLibraryRoot: 'library:choose-root',
} as const;

export interface BootstrapState {
  appVersion: string;
  libraryId: string;
  libraryRoot: string | null;
  libraryRootAvailable: boolean;
  platform: NodeJS.Platform;
}

export interface ChooseLibraryRootResult {
  cancelled: boolean;
  state: BootstrapState;
}

export interface LocalVideoManagerApi {
  getBootstrapState(): Promise<BootstrapState>;
  chooseLibraryRoot(): Promise<ChooseLibraryRootResult>;
}
