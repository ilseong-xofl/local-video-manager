import { describe, expect, it } from 'vitest';

import { fitCaptionedPreviewStage, fitPreviewStage } from './video-editor-layout';

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

describe('fitCaptionedPreviewStage', () => {
  it('sets the caption to 1.2 times the 9:16 video width', () => {
    const size = fitCaptionedPreviewStage({
      aspectHeight: 1920,
      aspectWidth: 1080,
      availableHeight: 800,
      controlsHeight: 42,
      maxStageHeight: 680,
      minCaptionWidth: 0,
    });

    expect(size).not.toBeNull();
    expect(size?.height).toBe(680);
    expect(size?.captionWidth).toBeCloseTo((size?.width ?? 0) * 1.2);
    expect(size?.pairWidth).toBeCloseTo((size?.width ?? 0) + (size?.captionWidth ?? 0));
  });

  it('keeps the caption width fixed when the output ratio changes', () => {
    const portrait = fitCaptionedPreviewStage({
      aspectHeight: 16,
      aspectWidth: 9,
      availableHeight: 800,
      controlsHeight: 42,
      maxStageHeight: 680,
      minCaptionWidth: 0,
    });
    const square = fitCaptionedPreviewStage({
      aspectHeight: 1,
      aspectWidth: 1,
      availableHeight: 800,
      controlsHeight: 42,
      maxStageHeight: 680,
      minCaptionWidth: 0,
    });

    expect(square?.captionWidth).toBeCloseTo(portrait?.captionWidth ?? 0);
    expect(square?.width).toBeGreaterThan(portrait?.width ?? 0);
  });

  it('preserves the full card width so a narrow viewport can scroll horizontally', () => {
    const size = fitCaptionedPreviewStage({
      aspectHeight: 1920,
      aspectWidth: 1080,
      availableHeight: 800,
      controlsHeight: 42,
      maxStageHeight: 680,
      minCaptionWidth: 0,
    });

    expect(size?.pairWidth).toBeGreaterThan(800);
  });

  it('keeps the caption wide enough for its longest controls in a short window', () => {
    const size = fitCaptionedPreviewStage({
      aspectHeight: 1920,
      aspectWidth: 1080,
      availableHeight: 520,
      controlsHeight: 42,
      maxStageHeight: 680,
      minCaptionWidth: 459,
    });

    expect(size?.captionWidth).toBe(459);
    expect(size?.height).toBe(478);
    expect(size?.pairWidth).toBeCloseTo(478 * (9 / 16) + 459);
  });
});
