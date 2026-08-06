import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

interface VideoByteRange {
  end: number;
  start: number;
}

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv',
};

export function parseVideoByteRange(rangeHeader: string, fileSize: number): VideoByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || fileSize <= 0 || (!match[1] && !match[2])) {
    return null;
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      end: fileSize - 1,
      start: Math.max(fileSize - suffixLength, 0),
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }

  return { end: Math.min(requestedEnd, fileSize - 1), start };
}

export async function createVideoFileResponse(
  videoPath: string,
  request: Request,
): Promise<Response> {
  const fileSize = (await stat(videoPath)).size;
  const rangeHeader = request.headers.get('range');
  const range = rangeHeader ? parseVideoByteRange(rangeHeader, fileSize) : null;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': VIDEO_CONTENT_TYPES[extname(videoPath).toLowerCase()] ?? 'video/mp4',
  });

  if (rangeHeader && !range) {
    headers.set('Content-Range', `bytes */${fileSize}`);
    return new Response(null, { headers, status: 416 });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? fileSize - 1;
  const contentLength = range ? end - start + 1 : fileSize;
  headers.set('Content-Length', String(contentLength));

  if (range) {
    headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers, status: range ? 206 : 200 });
  }

  const fileStream = createReadStream(videoPath, range ? { end, start } : undefined);
  const body = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;

  return new Response(body, { headers, status: range ? 206 : 200 });
}
