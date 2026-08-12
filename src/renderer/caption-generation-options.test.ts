import { describe, expect, it } from 'vitest';

import { chooseCaptionCopywriting, chooseCaptionVariation } from './caption-generation-options';

describe('caption generation options', () => {
  it('chooses from all four variations on every random request', () => {
    expect(chooseCaptionVariation('random', () => 0)).toBe(1);
    expect(chooseCaptionVariation('random', () => 0.99)).toBe(4);
  });

  it('keeps an explicitly selected variation on repeated requests', () => {
    expect(chooseCaptionVariation(3, () => 0)).toBe(3);
    expect(chooseCaptionVariation(3, () => 0.99)).toBe(3);
  });

  it('chooses a copywriting type independently on every random request', () => {
    expect(chooseCaptionCopywriting('random', () => 0)).toBe('field-report');
    expect(chooseCaptionCopywriting('random', () => 0.99)).toBe('calm-analyst');
    expect(chooseCaptionCopywriting('field-report', () => 0.99)).toBe('field-report');
  });
});
