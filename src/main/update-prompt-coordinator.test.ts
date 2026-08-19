import { describe, expect, it, vi } from 'vitest';

import { UpdatePromptCoordinator, type UpdatePromptChoice } from './update-prompt-coordinator';

const update = {
  releaseName: '0.3.1',
  updateUrl: 'https://example.test/update',
};

function createCoordinator(choice: UpdatePromptChoice = 'later') {
  const onError = vi.fn();
  const restart = vi.fn();
  const showPrompt = vi.fn(async () => choice);
  const coordinator = new UpdatePromptCoordinator({
    onError,
    restart,
    showPrompt,
  });

  return { coordinator, onError, restart, showPrompt };
}

describe('UpdatePromptCoordinator', () => {
  it('lets the user postpone an update without restarting', async () => {
    const { coordinator, restart, showPrompt } = createCoordinator();

    coordinator.notify(update);
    await vi.waitFor(() => expect(showPrompt).toHaveBeenCalledOnce());

    expect(restart).not.toHaveBeenCalled();
  });

  it('restarts after the user chooses to install now', async () => {
    const { coordinator, restart } = createCoordinator('restart');

    coordinator.notify(update);
    await vi.waitFor(() => expect(restart).toHaveBeenCalledOnce());
  });

  it('does not show the same downloaded update more than once', async () => {
    const { coordinator, showPrompt } = createCoordinator();

    coordinator.notify(update);
    await vi.waitFor(() => expect(showPrompt).toHaveBeenCalledOnce());
    coordinator.notify(update);

    expect(showPrompt).toHaveBeenCalledOnce();
  });
});
