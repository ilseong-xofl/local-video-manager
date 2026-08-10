import { describe, expect, it } from 'vitest';

import { parseVideoTagId, parseVideoTagIds, parseVideoTagName } from './video-tags';

describe('video tags', () => {
  it('normalizes a non-empty tag name', () => {
    expect(parseVideoTagName(`  ${'유머'.normalize('NFD')}  `)).toBe('유머');
  });

  it('rejects invalid tag names', () => {
    expect(() => parseVideoTagName('   ')).toThrow('Invalid video tag name.');
    expect(() => parseVideoTagName('a'.repeat(41))).toThrow('Invalid video tag name.');
    expect(() => parseVideoTagName(1)).toThrow('Invalid video tag name.');
  });

  it('accepts positive tag IDs without duplicates', () => {
    expect(parseVideoTagId(1)).toBe(1);
    expect(parseVideoTagIds([1, 2])).toEqual([1, 2]);
    expect(() => parseVideoTagIds([1, 1])).toThrow('Invalid video tag IDs.');
    expect(() => parseVideoTagIds([0])).toThrow('Invalid video tag ID.');
  });
});
