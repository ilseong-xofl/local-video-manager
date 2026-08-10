import { describe, expect, it } from 'vitest';

import {
  formatVideoViewCount,
  parseVideoViewCount,
  parseVideoViewCountInput,
} from './video-view-count';

describe('video view count', () => {
  it('parses integers and Instagram-style compact values', () => {
    expect(parseVideoViewCountInput('0')).toBe(0);
    expect(parseVideoViewCountInput('1,250')).toBe(1_250);
    expect(parseVideoViewCountInput('1.2K')).toBe(1_200);
    expect(parseVideoViewCountInput('2m')).toBe(2_000_000);
  });

  it('formats counts with K and M suffixes', () => {
    expect(formatVideoViewCount(0)).toBe('0');
    expect(formatVideoViewCount(999)).toBe('999');
    expect(formatVideoViewCount(1_200)).toBe('1.2K');
    expect(formatVideoViewCount(999_999)).toBe('1M');
    expect(formatVideoViewCount(3_000_000)).toBe('3M');
  });

  it('rejects negative, decimal-only, malformed, and unsafe values', () => {
    expect(() => parseVideoViewCountInput('-1')).toThrow('Invalid video view count.');
    expect(() => parseVideoViewCountInput('1.5')).toThrow('Invalid video view count.');
    expect(() => parseVideoViewCountInput('12Q')).toThrow('Invalid video view count.');
    expect(() => parseVideoViewCount(-1)).toThrow('Invalid video view count.');
    expect(() => parseVideoViewCount(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'Invalid video view count.',
    );
  });
});
