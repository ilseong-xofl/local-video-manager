import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import type { Compiler } from 'webpack';

const MACOS_POLL_INTERVAL_MS = 1_000;

class MacOsPollingWatchPlugin {
  apply(compiler: Compiler): void {
    if (process.platform !== 'darwin') {
      return;
    }

    // Forge starts the main compiler with empty watch options, so wrap the public
    // compiler API to avoid exhausting native macOS file watchers.
    const watch = compiler.watch.bind(compiler);
    compiler.watch = (watchOptions, handler) =>
      watch({ ignored: /node_modules/, poll: MACOS_POLL_INTERVAL_MS, ...watchOptions }, handler);
  }
}

export const createPlugins = () => [
  new MacOsPollingWatchPlugin(),
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
];
