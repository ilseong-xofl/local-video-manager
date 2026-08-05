import { DefinePlugin, type Configuration } from 'webpack';

import { createPlugins } from './webpack.plugins';
import { rules } from './webpack.rules';

export const mainConfig: Configuration = {
  entry: './src/main/index.ts',
  module: {
    rules,
  },
  plugins: [
    ...createPlugins(),
    new DefinePlugin({
      LVM_GITHUB_REPOSITORY: JSON.stringify(process.env.GITHUB_REPOSITORY ?? ''),
    }),
  ],
  resolve: {
    alias: {
      'better-sqlite3$': `better-sqlite3/${process.platform}-${process.arch}`,
    },
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
  },
};
