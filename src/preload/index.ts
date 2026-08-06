import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type LocalVideoManagerApi } from '../shared/contracts';

const api: LocalVideoManagerApi = {
  getBootstrapState: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrapState),
  chooseLibraryRoot: () => ipcRenderer.invoke(IPC_CHANNELS.chooseLibraryRoot),
  getLibraryVideoPage: (pageIndex) =>
    ipcRenderer.invoke(IPC_CHANNELS.getLibraryVideoPage, pageIndex),
  getVideoMetadata: (contentHash) => ipcRenderer.invoke(IPC_CHANNELS.getVideoMetadata, contentHash),
  saveVideoMetadata: (contentHash, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveVideoMetadata, contentHash, input),
  scanLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.scanLibrary),
};

contextBridge.exposeInMainWorld('localVideoManager', api);
