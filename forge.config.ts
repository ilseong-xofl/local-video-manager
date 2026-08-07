import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const ffmpegBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffmpegResourceDirectory = join('node_modules', 'ffmpeg-static');
const ffmpegLicenseName = existsSync(join(ffmpegResourceDirectory, 'ffmpeg.LICENSE'))
  ? 'ffmpeg.LICENSE'
  : 'LICENSE';
const ffmpegReadmeName = existsSync(join(ffmpegResourceDirectory, 'ffmpeg.README'))
  ? 'ffmpeg.README'
  : 'README.md';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.localvideomanager.desktop',
    executableName: 'LocalVideoManager',
    extraResource: [
      join(ffmpegResourceDirectory, ffmpegBinaryName),
      join(ffmpegResourceDirectory, ffmpegLicenseName),
      join(ffmpegResourceDirectory, ffmpegReadmeName),
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'local_video_manager',
      setupExe: 'LocalVideoManager-win32-x64-Setup.exe',
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      devContentSecurityPolicy:
        "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-eval' 'unsafe-inline' data:; media-src 'self' local-video:",
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/index.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
