import { describe, expect, it } from 'vitest';

import { fitPreviewStage } from './video-editor-layout';

describe('fitPreviewStage', () => {
  it('keeps a 9:16 stage and its controls inside the available height', () => {
    const size = fitPreviewStage({
      aspectHeight: 1920,
      aspectWidth: 1080,
      availableHeight: 520,
      availableWidth: 900,
      controlsHeight: 42,
      maxStageHeight: 680,
    });

    expect(size).not.toBeNull();
    expect((size?.height ?? 0) + 42).toBeLessThanOrEqual(520);
    expect((size?.width ?? 0) / (size?.height ?? 1)).toBeCloseTo(9 / 16);
  });

  it('uses the available width for a wide stage without changing its ratio', () => {
    const size = fitPreviewStage({
      aspectHeight: 566,
      aspectWidth: 1080,
      availableHeight: 520,
      availableWidth: 760,
      controlsHeight: 42,
      maxStageHeight: 680,
    });

    expect(size?.width).toBe(760);
    expect((size?.width ?? 0) / (size?.height ?? 1)).toBeCloseTo(1080 / 566);
    expect((size?.height ?? 0) + 42).toBeLessThanOrEqual(520);
  });
});
