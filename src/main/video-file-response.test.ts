import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createVideoFileResponse, parseVideoByteRange } from './video-file-response';

const temporaryDirectories: string[] = [];

function createVideoFile(fileName = 'video.mp4'): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-response-test-'));
  temporaryDirectories.push(directory);
  const videoPath = join(directory, fileName);
  writeFileSync(videoPath, '0123456789');
  return videoPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('parseVideoByteRange', () => {
  it('parses open, closed, and suffix byte ranges', () => {
    expect(parseVideoByteRange('bytes=2-5', 10)).toEqual({ end: 5, start: 2 });
    expect(parseVideoByteRange('bytes=6-', 10)).toEqual({ end: 9, start: 6 });
    expect(parseVideoByteRange('bytes=-3', 10)).toEqual({ end: 9, start: 7 });
  });

  it('rejects malformed or unsatisfiable ranges', () => {
    expect(parseVideoByteRange('bytes=10-', 10)).toBeNull();
    expect(parseVideoByteRange('bytes=5-2', 10)).toBeNull();
    expect(parseVideoByteRange('items=0-2', 10)).toBeNull();
    expect(parseVideoByteRange('bytes=0-1,3-4', 10)).toBeNull();
  });
});

describe('createVideoFileResponse', () => {
  it('streams only the requested byte range without caching', async () => {
    const videoPath = createVideoFile();
    const request = new Request('local-video://media/hash', {
      headers: { Range: 'bytes=2-5' },
    });

    const response = await createVideoFileResponse(videoPath, request);

    expect(response.status).toBe(206);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(await response.text()).toBe('2345');
  });

  it('returns 416 for an unsatisfiable range', async () => {
    const videoPath = createVideoFile();
    const request = new Request('local-video://media/hash', {
      headers: { Range: 'bytes=20-' },
    });

    const response = await createVideoFileResponse(videoPath, request);

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  it('maps supported video extensions to media types', async () => {
    const response = await createVideoFileResponse(
      createVideoFile('video.webm'),
      new Request('local-video://media/hash'),
    );

    expect(response.headers.get('Content-Type')).toBe('video/webm');
    await response.body?.cancel();
  });
});
