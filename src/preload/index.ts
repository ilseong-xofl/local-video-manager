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
  setVideoReaction: (contentHash, reaction) =>
    ipcRenderer.invoke(IPC_CHANNELS.setVideoReaction, contentHash, reaction),
  getLibraryVideoPage: (pageIndex, query) =>
    ipcRenderer.invoke(IPC_CHANNELS.getLibraryVideoPage, pageIndex, query),
  openVideoSourceUrl: (contentHash) =>
    ipcRenderer.invoke(IPC_CHANNELS.openVideoSourceUrl, contentHash),
  revealVideoFile: (contentHash) => ipcRenderer.invoke(IPC_CHANNELS.revealVideoFile, contentHash),
  getVideoMetadata: (contentHash) => ipcRenderer.invoke(IPC_CHANNELS.getVideoMetadata, contentHash),
  searchVideoMetadata: (query, excludeContentHash) =>
    ipcRenderer.invoke(IPC_CHANNELS.searchVideoMetadata, query, excludeContentHash),
  saveVideoMetadata: (contentHash, input, copiedFromContentHash) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveVideoMetadata, contentHash, input, copiedFromContentHash),
  scanLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.scanLibrary),
  getVideoEditorPresets: () => ipcRenderer.invoke(IPC_CHANNELS.getVideoEditorPresets),
  createVideoEditorPreset: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.createVideoEditorPreset, input),
  updateVideoEditorPreset: (id, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateVideoEditorPreset, id, input),
  deleteVideoEditorPreset: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteVideoEditorPreset, id),
  startVideoRender: (contentHash, request) =>
    ipcRenderer.invoke(IPC_CHANNELS.startVideoRender, contentHash, request),
  cancelVideoRender: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.cancelVideoRender, jobId),
  revealRenderedVideo: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.revealRenderedVideo, jobId),
  onVideoRenderProgress: (listener) => {
    const handleProgress = (
      _event: Electron.IpcRendererEvent,
      progress: Parameters<typeof listener>[0],
    ) => listener(progress);
    ipcRenderer.on(IPC_CHANNELS.videoRenderProgress, handleProgress);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.videoRenderProgress, handleProgress);
  },
};

contextBridge.exposeInMainWorld('localVideoManager', api);
