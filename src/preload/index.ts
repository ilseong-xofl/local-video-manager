import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type LocalVideoManagerApi } from '../shared/contracts';

const api: LocalVideoManagerApi = {
  getBootstrapState: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrapState),
  chooseLibraryRoot: () => ipcRenderer.invoke(IPC_CHANNELS.chooseLibraryRoot),
  getLibraryVideoPage: (pageIndex, query) =>
    ipcRenderer.invoke(IPC_CHANNELS.getLibraryVideoPage, pageIndex, query),
  getVideoMetadata: (contentHash) => ipcRenderer.invoke(IPC_CHANNELS.getVideoMetadata, contentHash),
  searchVideoMetadata: (query, excludeContentHash) =>
    ipcRenderer.invoke(IPC_CHANNELS.searchVideoMetadata, query, excludeContentHash),
  saveVideoMetadata: (contentHash, input, copiedFromContentHash) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveVideoMetadata, contentHash, input, copiedFromContentHash),
  scanLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.scanLibrary),
};

contextBridge.exposeInMainWorld('localVideoManager', api);
