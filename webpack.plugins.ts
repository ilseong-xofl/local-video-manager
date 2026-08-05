import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

export const createPlugins = () => [
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
];
