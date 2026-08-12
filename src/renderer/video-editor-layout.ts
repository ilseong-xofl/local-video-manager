export interface PreviewStageSize {
  height: number;
  width: number;
}

export interface CaptionedPreviewStageSize extends PreviewStageSize {
  captionWidth: number;
  pairWidth: number;
}

interface FitPreviewStageOptions {
  aspectHeight: number;
  aspectWidth: number;
  availableHeight: number;
  availableWidth: number;
  controlsHeight: number;
  maxStageHeight: number;
}

type FitCaptionedPreviewStageOptions = Omit<FitPreviewStageOptions, 'availableWidth'> & {
  minCaptionWidth: number;
};

const PORTRAIT_REFERENCE_ASPECT_RATIO = 9 / 16;
const CAPTION_WIDTH_RATIO = 1.2;

export function fitPreviewStage({
  aspectHeight,
  aspectWidth,
  availableHeight,
  availableWidth,
  controlsHeight,
  maxStageHeight,
}: FitPreviewStageOptions): PreviewStageSize | null {
  const stageHeightLimit = Math.min(availableHeight - controlsHeight, maxStageHeight);
  if (aspectHeight <= 0 || aspectWidth <= 0 || availableWidth <= 0 || stageHeightLimit <= 0) {
    return null;
  }

  const aspectRatio = aspectWidth / aspectHeight;
  const width = Math.min(availableWidth, stageHeightLimit * aspectRatio);

  return {
    height: width / aspectRatio,
    width,
  };
}

export function fitCaptionedPreviewStage({
  aspectHeight,
  aspectWidth,
  availableHeight,
  controlsHeight,
  maxStageHeight,
  minCaptionWidth,
}: FitCaptionedPreviewStageOptions): CaptionedPreviewStageSize | null {
  const height = Math.min(availableHeight - controlsHeight, maxStageHeight);
  if (aspectHeight <= 0 || aspectWidth <= 0 || height <= 0) {
    return null;
  }

  const width = height * (aspectWidth / aspectHeight);
  const captionWidth = Math.max(
    height * PORTRAIT_REFERENCE_ASPECT_RATIO * CAPTION_WIDTH_RATIO,
    minCaptionWidth,
  );

  return {
    captionWidth,
    height,
    pairWidth: width + captionWidth,
    width,
  };
}
