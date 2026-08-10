import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET,
  getDefaultVideoEditorFontFamily,
} from '../shared/contracts';
import {
  buildFfmpegArguments,
  parseFfmpegDurationMs,
  parseFfmpegProgressMs,
  parseVideoEditorPresetInput,
  parseVideoEditorTextPresetInput,
  parseVideoRenderRequest,
} from './video-editor';

const textStyle = {
  backgroundColor: '#111111',
  backgroundOpacity: 0.8,
  fontFamily: 'Noto Sans KR',
  fontMarket: 'KR' as const,
  fontSizePercent: 4.5,
  fontWeight: 700 as const,
  textAlign: 'center' as const,
  textColor: '#ffffff',
};

describe('video editor validation', () => {
  it('exposes the Marketo font catalog for Korea, Japan, and the United States', () => {
    expect(VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET.KR.map((font) => font.value)).toEqual([
      'Noto Sans KR',
      'Black Han Sans',
      'Jua',
      'Do Hyeon',
      'Gugi',
      'Nanum Pen Script',
      'Nanum Gothic',
      'Sunflower',
      'Gamja Flower',
      'Yeon Sung',
      'Gothic A1',
      'Cute Font',
      'Bagel Fat One',
      'Hi Melody',
      'East Sea Dokdo',
    ]);
    expect(VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET.JP.map((font) => font.value)).toEqual([
      'Noto Sans JP',
      'M PLUS Rounded 1c',
      'Kosugi Maru',
      'Yusei Magic',
      'RocknRoll One',
      'Reggae One',
      'DotGothic16',
      'Zen Kaku Gothic New',
    ]);
    expect(VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET.US.map((font) => font.value)).toEqual([
      'Montserrat',
      'Anton',
      'Bebas Neue',
      'Oswald',
      'Archivo Black',
      'Rubik',
      'Fredoka',
      'Bangers',
      'Permanent Marker',
      'Righteous',
    ]);
    expect(getDefaultVideoEditorFontFamily('KR')).toBe('Noto Sans KR');
    expect(getDefaultVideoEditorFontFamily('JP')).toBe('Noto Sans JP');
    expect(getDefaultVideoEditorFontFamily('US')).toBe('Montserrat');

    for (const fonts of Object.values(VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET)) {
      expect(new Set(fonts.map((font) => font.label)).size).toBe(fonts.length);
      expect(fonts.every((font) => !font.label.includes('(') && !font.label.includes(')'))).toBe(
        true,
      );
    }
  });

  it('normalizes a valid preset and enforces platform ratios', () => {
    expect(
      parseVideoEditorPresetInput({
        aspectRatio: '9:16',
        defaultTextStyle: textStyle,
        letterboxColor: '#000000',
        name: '  릴스 기본  ',
        platform: 'instagram',
        resizeMode: 'crop',
      }),
    ).toEqual({
      aspectRatio: '9:16',
      defaultTextStyle: { ...textStyle, textColor: '#FFFFFF' },
      letterboxColor: '#000000',
      name: '릴스 기본',
      platform: 'instagram',
      resizeMode: 'crop',
    });

    expect(() =>
      parseVideoEditorPresetInput({
        aspectRatio: '16:9',
        defaultTextStyle: textStyle,
        letterboxColor: '#000000',
        name: '잘못된 릴스',
        platform: 'instagram',
        resizeMode: 'crop',
      }),
    ).toThrow('Invalid video editor preset.');

    expect(() =>
      parseVideoEditorPresetInput({
        aspectRatio: '9:16',
        defaultTextStyle: { ...textStyle, fontFamily: 'Montserrat' },
        letterboxColor: '#000000',
        name: '권역과 맞지 않는 폰트',
        platform: 'instagram',
        resizeMode: 'letterbox',
      }),
    ).toThrow('Invalid video editor text style.');
  });

  it('accepts only bounded PNG overlay data', () => {
    expect(
      parseVideoRenderRequest({
        aspectRatio: '1:1',
        letterboxColor: '#abcdef',
        overlayImageDataUrl: 'data:image/png;base64,aGVsbG8=',
        resizeMode: 'letterbox',
      }),
    ).toEqual({
      aspectRatio: '1:1',
      letterboxColor: '#ABCDEF',
      overlayImageDataUrl: 'data:image/png;base64,aGVsbG8=',
      resizeMode: 'letterbox',
    });

    expect(() =>
      parseVideoRenderRequest({
        aspectRatio: '1:1',
        letterboxColor: '#000000',
        overlayImageDataUrl: 'data:text/plain;base64,aGVsbG8=',
        resizeMode: 'crop',
      }),
    ).toThrow('Invalid video render request.');
  });

  it('normalizes text presets without retaining text or runtime IDs', () => {
    expect(
      parseVideoEditorTextPresetInput({
        name: '  상단 두 줄  ',
        overlays: [
          {
            id: 'runtime-id',
            region: { height: 0.18, width: 0.8, x: 0.1, y: 0.05 },
            style: textStyle,
            text: '저장하면 안 되는 문구',
          },
        ],
      }),
    ).toEqual({
      name: '상단 두 줄',
      overlays: [
        {
          region: { height: 0.18, width: 0.8, x: 0.1, y: 0.05 },
          style: { ...textStyle, textColor: '#FFFFFF' },
        },
      ],
    });

    expect(() =>
      parseVideoEditorTextPresetInput({
        name: '잘못된 영역',
        overlays: [
          {
            region: { height: 0.5, width: 0.5, x: 0.8, y: 0 },
            style: textStyle,
          },
        ],
      }),
    ).toThrow('Invalid video editor text region.');
  });
});

describe('FFmpeg render arguments', () => {
  it('builds a crop render with a static overlay and optional audio', () => {
    const args = buildFfmpegArguments('/videos/source.mp4', '/tmp/overlay.png', '/tmp/output.mp4', {
      aspectRatio: '9:16',
      letterboxColor: '#000000',
      overlayImageDataUrl: 'data:image/png;base64,aGVsbG8=',
      resizeMode: 'crop',
    });

    expect(args).toContain('-filter_complex');
    expect(args).toContain(
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[base];[1:v]format=rgba[overlay];[base][overlay]overlay=0:0:format=auto,format=yuv420p[outv]',
    );
    expect(args).toEqual(expect.arrayContaining(['-map', '0:a?', '-c:v', 'libx264']));
    expect(args.at(-1)).toBe('/tmp/output.mp4');
  });

  it('builds a letterbox render without an overlay', () => {
    const args = buildFfmpegArguments('/videos/source.mp4', null, '/tmp/output.mp4', {
      aspectRatio: '16:9',
      letterboxColor: '#112233',
      overlayImageDataUrl: null,
      resizeMode: 'letterbox',
    });

    expect(args).not.toContain('-filter_complex');
    expect(args).toContain(
      'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x112233,setsar=1,format=yuv420p',
    );
  });

  it('parses duration and progress output', () => {
    expect(parseFfmpegDurationMs('Duration: 00:01:02.50, start: 0.000000')).toBe(62_500);
    expect(parseFfmpegDurationMs('no duration')).toBeNull();
    expect(parseFfmpegProgressMs('out_time_us=31250000')).toBe(31_250);
    expect(parseFfmpegProgressMs('progress=continue')).toBeNull();
  });

  it('renders and decodes a local MP4 with the bundled FFmpeg binary', () => {
    const directory = mkdtempSync(join(tmpdir(), 'local-video-editor-ffmpeg-test-'));
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegPath = resolve('node_modules', 'ffmpeg-static', binaryName);
    const inputPath = join(directory, 'input.mp4');
    const overlayPath = join(directory, 'overlay.png');
    const outputPath = join(directory, 'output.mp4');

    try {
      const source = spawnSync(
        ffmpegPath,
        [
          '-hide_banner',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=blue:s=160x90:d=0.25:r=10',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          inputPath,
        ],
        { encoding: 'utf8', timeout: 30_000 },
      );
      expect(source.status, source.stderr).toBe(0);
      const overlay = spawnSync(
        ffmpegPath,
        [
          '-hide_banner',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=red:s=16x16:d=0.04',
          '-frames:v',
          '1',
          overlayPath,
        ],
        { encoding: 'utf8', timeout: 30_000 },
      );
      expect(overlay.status, overlay.stderr).toBe(0);

      const render = spawnSync(
        ffmpegPath,
        buildFfmpegArguments(inputPath, overlayPath, outputPath, {
          aspectRatio: '1:1',
          letterboxColor: '#000000',
          overlayImageDataUrl: 'data:image/png;base64,test',
          resizeMode: 'letterbox',
        }),
        { encoding: 'utf8', timeout: 30_000 },
      );
      expect(render.status, render.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);
      expect(statSync(outputPath).size).toBeGreaterThan(0);

      const decode = spawnSync(
        ffmpegPath,
        ['-hide_banner', '-v', 'error', '-i', outputPath, '-f', 'null', '-'],
        { encoding: 'utf8', timeout: 30_000 },
      );
      expect(decode.status, decode.stderr).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
