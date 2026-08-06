import { describe, expect, it } from 'vitest';

import { parseContentHash, parseVideoMetadataInput } from './video-metadata';

describe('video metadata input', () => {
  it('normalizes optional URL and caption values', () => {
    expect(
      parseVideoMetadataInput({
        sourceCaption: '  First line\nSecond line  ',
        sourceUrl: '  https://www.instagram.com/reel/example/  ',
      }),
    ).toEqual({
      sourceCaption: 'First line\nSecond line',
      sourceUrl: 'https://www.instagram.com/reel/example/',
    });

    expect(parseVideoMetadataInput({ sourceCaption: 'Caption only', sourceUrl: '   ' })).toEqual({
      sourceCaption: 'Caption only',
      sourceUrl: null,
    });
  });

  it('rejects empty metadata and non-http source URLs', () => {
    expect(() => parseVideoMetadataInput({ sourceCaption: ' ', sourceUrl: '' })).toThrow(
      'A source URL or caption is required.',
    );
    expect(() =>
      parseVideoMetadataInput({ sourceCaption: null, sourceUrl: 'file:///tmp/video.mp4' }),
    ).toThrow('Source URL must use HTTP or HTTPS.');
    expect(() => parseVideoMetadataInput({ sourceCaption: null, sourceUrl: 'not a url' })).toThrow(
      'Source URL is invalid.',
    );
  });

  it('accepts only lowercase SHA-256 content hashes', () => {
    const contentHash = 'a'.repeat(64);

    expect(parseContentHash(contentHash)).toBe(contentHash);
    expect(() => parseContentHash('A'.repeat(64))).toThrow('Invalid video content hash.');
    expect(() => parseContentHash('../video.mp4')).toThrow('Invalid video content hash.');
  });
});
