import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type LocalVideoManagerApi } from '../shared/contracts';

const api: LocalVideoManagerApi = {
  getBootstrapState: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrapState),
  chooseLibraryRoot: () => ipcRenderer.invoke(IPC_CHANNELS.chooseLibraryRoot),
  scanLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.scanLibrary),
};

contextBridge.exposeInMainWorld('localVideoManager', api);
