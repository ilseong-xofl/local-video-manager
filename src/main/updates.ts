import { app, autoUpdater } from 'electron';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

import { normalizeGitHubRepository } from './github-repository';

export function configureAutoUpdates(): void {
  if (!app.isPackaged || process.platform !== 'win32') {
    return;
  }

  const repository = normalizeGitHubRepository(LVM_GITHUB_REPOSITORY);
  if (!repository) {
    console.info('[updates] GitHub repository is not embedded; update checks are disabled.');
    return;
  }

  const { stopUpdates } = updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: repository,
    },
    notifyUser: true,
    onNotifyUser: () => {
      console.info('[updates] Update downloaded; restarting to install.');
      autoUpdater.quitAndInstall();
    },
    updateInterval: '1 hour',
    logger: console,
  });

  stopUpdates();
}
