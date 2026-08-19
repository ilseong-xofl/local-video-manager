export interface UpdateNotification {
  releaseName: string;
  updateUrl: string;
}

export type UpdatePromptChoice = 'later' | 'restart';

interface UpdatePromptCoordinatorOptions {
  onError: (error: unknown) => void;
  restart: () => void;
  showPrompt: (update: UpdateNotification) => Promise<UpdatePromptChoice>;
}

function notificationKey(update: UpdateNotification): string {
  return `${update.releaseName}\n${update.updateUrl}`;
}

export class UpdatePromptCoordinator {
  private readonly handledNotifications = new Set<string>();
  private disposed = false;
  private promptingKey: string | null = null;

  public constructor(private readonly options: UpdatePromptCoordinatorOptions) {}

  public notify(update: UpdateNotification): void {
    if (this.disposed) {
      return;
    }

    const key = notificationKey(update);
    if (this.handledNotifications.has(key) || this.promptingKey === key) {
      return;
    }

    this.prompt(update, key);
  }

  public dispose(): void {
    this.disposed = true;
  }

  private prompt(update: UpdateNotification, key: string): void {
    this.promptingKey = key;

    void this.options
      .showPrompt(update)
      .then((choice) => {
        if (this.disposed) {
          return;
        }

        this.handledNotifications.add(key);
        if (choice === 'restart') {
          this.options.restart();
        }
      })
      .catch((error: unknown) => {
        this.handledNotifications.add(key);
        this.options.onError(error);
      })
      .finally(() => {
        this.promptingKey = null;
      });
  }
}
