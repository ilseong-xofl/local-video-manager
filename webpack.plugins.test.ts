import type { Compiler } from 'webpack';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlugins } from './webpack.plugins';

describe('MacOsPollingWatchPlugin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses polling and ignores dependencies on macOS', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    const originalWatch = vi.fn();
    const compiler = { watch: originalWatch } as unknown as Compiler;
    const [pollingPlugin] = createPlugins();
    const handler = vi.fn();

    pollingPlugin.apply(compiler);
    compiler.watch({ aggregateTimeout: 250 }, handler);

    expect(originalWatch).toHaveBeenCalledWith(
      { aggregateTimeout: 250, ignored: /node_modules/, poll: 1_000 },
      handler,
    );
  });

  it('keeps native file watching on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const originalWatch = vi.fn();
    const compiler = { watch: originalWatch } as unknown as Compiler;
    const [pollingPlugin] = createPlugins();

    pollingPlugin.apply(compiler);

    expect(compiler.watch).toBe(originalWatch);
  });
});
