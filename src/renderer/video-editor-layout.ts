export interface PreviewStageSize {
  height: number;
  width: number;
}

interface FitPreviewStageOptions {
  aspectHeight: number;
  aspectWidth: number;
  availableHeight: number;
  availableWidth: number;
  controlsHeight: number;
  maxStageHeight: number;
}

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
