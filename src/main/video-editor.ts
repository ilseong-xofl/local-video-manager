import {
  VIDEO_EDITOR_OUTPUT_SIZES,
  VIDEO_EDITOR_OVERLAY_IMAGE_MAX_LENGTH,
  VIDEO_EDITOR_PLATFORM_RATIOS,
  VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH,
  type VideoEditorAspectRatio,
  type VideoEditorPresetInput,
  type VideoEditorTextStyle,
  type VideoRenderRequest,
} from '../shared/contracts';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PNG_DATA_URL_PATTERN = /^data:image\/png;base64,[a-z0-9+/=\r\n]+$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseHexColor(value: unknown): string {
  if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
    throw new Error('Invalid video editor color.');
  }

  return value.toUpperCase();
}

function parseTextStyle(value: unknown): VideoEditorTextStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid video editor text style.');
  }

  const style = value as Record<string, unknown>;
  if (
    typeof style.backgroundOpacity !== 'number' ||
    !Number.isFinite(style.backgroundOpacity) ||
    style.backgroundOpacity < 0 ||
    style.backgroundOpacity > 1 ||
    typeof style.fontSizePercent !== 'number' ||
    !Number.isFinite(style.fontSizePercent) ||
    style.fontSizePercent < 1 ||
    style.fontSizePercent > 20 ||
    (style.fontWeight !== 400 && style.fontWeight !== 700 && style.fontWeight !== 900) ||
    (style.textAlign !== 'left' && style.textAlign !== 'center' && style.textAlign !== 'right')
  ) {
    throw new Error('Invalid video editor text style.');
  }

  return {
    backgroundColor: parseHexColor(style.backgroundColor),
    backgroundOpacity: style.backgroundOpacity,
    fontSizePercent: style.fontSizePercent,
    fontWeight: style.fontWeight,
    textAlign: style.textAlign,
    textColor: parseHexColor(style.textColor),
  };
}

export function parseVideoEditorPresetId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Invalid video editor preset ID.');
  }

  return value;
}

export function parseVideoRenderJobId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error('Invalid video render job ID.');
  }

  return value;
}

export function parseVideoEditorPresetInput(value: unknown): VideoEditorPresetInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid video editor preset.');
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim().normalize('NFC') : '';
  const platform = input.platform;
  const aspectRatio = input.aspectRatio;
  if (
    !name ||
    name.length > VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH ||
    (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'x') ||
    typeof aspectRatio !== 'string' ||
    !VIDEO_EDITOR_PLATFORM_RATIOS[platform].some((ratio) => ratio === aspectRatio) ||
    (input.resizeMode !== 'crop' && input.resizeMode !== 'letterbox')
  ) {
    throw new Error('Invalid video editor preset.');
  }

  return {
    aspectRatio: aspectRatio as VideoEditorAspectRatio,
    defaultTextStyle: parseTextStyle(input.defaultTextStyle),
    letterboxColor: parseHexColor(input.letterboxColor),
    name,
    platform,
    resizeMode: input.resizeMode,
  };
}

export function parseVideoRenderRequest(value: unknown): VideoRenderRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid video render request.');
  }

  const request = value as Record<string, unknown>;
  if (
    typeof request.aspectRatio !== 'string' ||
    !(request.aspectRatio in VIDEO_EDITOR_OUTPUT_SIZES) ||
    (request.resizeMode !== 'crop' && request.resizeMode !== 'letterbox') ||
    (request.overlayImageDataUrl !== null &&
      (typeof request.overlayImageDataUrl !== 'string' ||
        request.overlayImageDataUrl.length > VIDEO_EDITOR_OVERLAY_IMAGE_MAX_LENGTH ||
        !PNG_DATA_URL_PATTERN.test(request.overlayImageDataUrl)))
  ) {
    throw new Error('Invalid video render request.');
  }

  return {
    aspectRatio: request.aspectRatio as VideoEditorAspectRatio,
    letterboxColor: parseHexColor(request.letterboxColor),
    overlayImageDataUrl: request.overlayImageDataUrl,
    resizeMode: request.resizeMode,
  };
}

function buildBaseVideoFilter(request: VideoRenderRequest): string {
  const { width, height } = VIDEO_EDITOR_OUTPUT_SIZES[request.aspectRatio];
  if (request.resizeMode === 'crop') {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  }

  const color = request.letterboxColor.replace('#', '0x');
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${color},setsar=1`;
}

export function buildFfmpegArguments(
  inputPath: string,
  overlayPath: string | null,
  outputPath: string,
  request: VideoRenderRequest,
): string[] {
  const baseFilter = buildBaseVideoFilter(request);
  const inputArguments = ['-hide_banner', '-y', '-i', inputPath];
  const filterArguments = overlayPath
    ? [
        '-i',
        overlayPath,
        '-filter_complex',
        `[0:v]${baseFilter}[base];[1:v]format=rgba[overlay];[base][overlay]overlay=0:0:format=auto,format=yuv420p[outv]`,
        '-map',
        '[outv]',
      ]
    : ['-vf', `${baseFilter},format=yuv420p`, '-map', '0:v:0'];

  return [
    ...inputArguments,
    ...filterArguments,
    '-map',
    '0:a?',
    '-map_metadata',
    '0',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  ];
}

export function parseFfmpegDurationMs(output: string): number | null {
  const match = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(output);
  if (!match) {
    return null;
  }

  return (Number(match[1]) * 60 * 60 + Number(match[2]) * 60 + Number(match[3])) * 1_000;
}

export function parseFfmpegProgressMs(line: string): number | null {
  const match = /^(?:out_time_us|out_time_ms)=(\d+)$/.exec(line.trim());
  return match ? Math.floor(Number(match[1]) / 1_000) : null;
}
