import { app, autoUpdater, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import { updateElectronApp, UpdateSourceType, type IUpdateInfo } from 'update-electron-app';

import { normalizeGitHubRepository } from './github-repository';
import {
  UpdatePromptCoordinator,
  type UpdateNotification,
  type UpdatePromptChoice,
} from './update-prompt-coordinator';

function toUpdateNotification(info: IUpdateInfo): UpdateNotification {
  return {
    releaseName: typeof info.releaseName === 'string' ? info.releaseName.trim() : '',
    updateUrl: typeof info.updateURL === 'string' ? info.updateURL : '',
  };
}

async function showUpdatePrompt(update: UpdateNotification): Promise<UpdatePromptChoice> {
  const versionLabel = update.releaseName ? ` ${update.releaseName}` : '';
  const options: MessageBoxOptions = {
    type: 'info',
    title: '업데이트 준비 완료',
    message: `새 버전${versionLabel} 업데이트가 준비되었습니다.`,
    detail:
      "'지금 재시작'을 선택하면 업데이트를 바로 적용합니다. '나중에'를 선택하면 앱을 다음에 실행할 때 자동으로 적용됩니다.",
    buttons: ['나중에', '지금 재시작'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const parentWindow =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
  const result = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);

  return result.response === 1 ? 'restart' : 'later';
}

export function configureAutoUpdates(): () => void {
  if (!app.isPackaged || process.platform !== 'win32') {
    return () => undefined;
  }

  const repository = normalizeGitHubRepository(LVM_GITHUB_REPOSITORY);
  if (!repository) {
    console.info('[updates] GitHub repository is not embedded; update checks are disabled.');
    return () => undefined;
  }

  const promptCoordinator = new UpdatePromptCoordinator({
    showPrompt: showUpdatePrompt,
    restart: () => autoUpdater.quitAndInstall(),
    onError: (error) => console.error('[updates] Failed to show the update prompt.', error),
  });

  const { stopUpdates } = updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: repository,
    },
    notifyUser: true,
    onNotifyUser: (info) => {
      console.info('[updates] Update downloaded; waiting for user confirmation.');
      promptCoordinator.notify(toUpdateNotification(info));
    },
    updateInterval: '1 hour',
    logger: console,
  });

  return () => {
    promptCoordinator.dispose();
    stopUpdates();
  };
}
