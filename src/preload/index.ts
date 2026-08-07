import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type LocalVideoManagerApi } from '../shared/contracts';

const api: LocalVideoManagerApi = {
  getBootstrapState: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrapState),
  createDatabaseBackup: () => ipcRenderer.invoke(IPC_CHANNELS.createDatabaseBackup),
  restoreDatabaseBackup: () => ipcRenderer.invoke(IPC_CHANNELS.restoreDatabaseBackup),
  chooseLibraryRoot: () => ipcRenderer.invoke(IPC_CHANNELS.chooseLibraryRoot),
  getTags: () => ipcRenderer.invoke(IPC_CHANNELS.getTags),
  createTag: (name) => ipcRenderer.invoke(IPC_CHANNELS.createTag, name),
  renameTag: (id, name) => ipcRenderer.invoke(IPC_CHANNELS.renameTag, id, name),
  deleteTag: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteTag, id),
  setVideoTags: (contentHash, tagIds) =>
    ipcRenderer.invoke(IPC_CHANNELS.setVideoTags, contentHash, tagIds),
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
