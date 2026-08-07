import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  VIDEO_EDITOR_OUTPUT_SIZES,
  VIDEO_EDITOR_PLATFORM_RATIOS,
  VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH,
  type LibraryVideoItem,
  type VideoEditorAspectRatio,
  type VideoEditorPlatform,
  type VideoEditorPreset,
  type VideoEditorPresetInput,
  type VideoEditorRegion,
  type VideoEditorTextOverlay,
  type VideoEditorTextStyle,
  type VideoRenderProgress,
} from '../shared/contracts';

interface VideoEditorProps {
  onBack(): void;
  video: LibraryVideoItem;
}

interface DragState {
  mode: 'move' | 'resize';
  pointerId: number;
  region: VideoEditorRegion;
  startX: number;
  startY: number;
}

const PLATFORM_LABELS: Record<VideoEditorPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
};

const DEFAULT_TEXT_STYLE: VideoEditorTextStyle = {
  backgroundColor: '#111111',
  backgroundOpacity: 1,
  fontSizePercent: 3,
  fontWeight: 700,
  textAlign: 'center',
  textColor: '#FFFFFF',
};

function createDefaultPreset(): VideoEditorPresetInput {
  return {
    aspectRatio: '9:16',
    defaultTextStyle: { ...DEFAULT_TEXT_STYLE },
    letterboxColor: '#000000',
    name: '새 편집 설정',
    platform: 'instagram',
    resizeMode: 'crop',
  };
}

function copyPreset(preset: VideoEditorPresetInput): VideoEditorPresetInput {
  return {
    ...preset,
    defaultTextStyle: { ...preset.defaultTextStyle },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToRgba(color: string, opacity: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function splitTextLines(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const character of Array.from(paragraph)) {
      const candidate = `${line}${character}`;
      if (line && context.measureText(candidate).width > maximumWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function createOverlayImageDataUrl(
  overlays: readonly VideoEditorTextOverlay[],
  aspectRatio: VideoEditorAspectRatio,
): Promise<string | null> {
  if (overlays.length === 0) {
    return null;
  }

  await document.fonts.ready;
  const { width, height } = VIDEO_EDITOR_OUTPUT_SIZES[aspectRatio];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available.');
  }

  for (const overlay of overlays) {
    const regionX = Math.round(overlay.region.x * width);
    const regionY = Math.round(overlay.region.y * height);
    const regionWidth = Math.round(overlay.region.width * width);
    const regionHeight = Math.round(overlay.region.height * height);
    context.save();
    context.globalAlpha = overlay.style.backgroundOpacity;
    context.fillStyle = overlay.style.backgroundColor;
    context.fillRect(regionX, regionY, regionWidth, regionHeight);
    context.restore();

    if (!overlay.text) {
      continue;
    }

    const padding = Math.max(8, Math.round(Math.min(regionWidth, regionHeight) * 0.06));
    const maximumTextWidth = Math.max(1, regionWidth - padding * 2);
    const maximumTextHeight = Math.max(1, regionHeight - padding * 2);
    let fontSize = Math.max(12, Math.round((height * overlay.style.fontSizePercent) / 100));
    let lines: string[] = [];
    let lineHeight = 0;
    while (fontSize >= 12) {
      context.font = `${overlay.style.fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      lines = splitTextLines(context, overlay.text, maximumTextWidth);
      lineHeight = Math.round(fontSize * 1.2);
      if (lines.length * lineHeight <= maximumTextHeight) {
        break;
      }
      fontSize -= 2;
    }

    context.save();
    context.beginPath();
    context.rect(regionX, regionY, regionWidth, regionHeight);
    context.clip();
    context.globalAlpha = 1;
    context.fillStyle = overlay.style.textColor;
    context.textAlign = overlay.style.textAlign;
    context.textBaseline = 'top';
    const textX =
      overlay.style.textAlign === 'left'
        ? regionX + padding
        : overlay.style.textAlign === 'right'
          ? regionX + regionWidth - padding
          : regionX + regionWidth / 2;
    const textY = regionY + Math.max(padding, (regionHeight - lines.length * lineHeight) / 2);
    lines.forEach((line, index) => context.fillText(line, textX, textY + index * lineHeight));
    context.restore();
  }

  return canvas.toDataURL('image/png');
}

export function VideoEditor({ onBack, video }: VideoEditorProps) {
  const [presets, setPresets] = useState<VideoEditorPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [presetDraft, setPresetDraft] = useState<VideoEditorPresetInput>(createDefaultPreset);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<VideoEditorTextOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [previewHeight, setPreviewHeight] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoPaused, setVideoPaused] = useState(true);
  const [renderStarting, setRenderStarting] = useState(false);
  const [renderProgress, setRenderProgress] = useState<VideoRenderProgress | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const selectedOverlay = useMemo(
    () => overlays.find((overlay) => overlay.id === selectedOverlayId) ?? null,
    [overlays, selectedOverlayId],
  );
  const supportedRatios = VIDEO_EDITOR_PLATFORM_RATIOS[
    presetDraft.platform
  ] as readonly VideoEditorAspectRatio[];
  const outputSize = VIDEO_EDITOR_OUTPUT_SIZES[presetDraft.aspectRatio];
  const rendering = renderStarting || renderProgress?.status === 'running';

  useEffect(() => {
    let active = true;
    void window.localVideoManager
      .getVideoEditorPresets()
      .then((loadedPresets) => {
        if (!active) {
          return;
        }
        setPresets(loadedPresets);
        if (loadedPresets[0]) {
          setSelectedPresetId(loadedPresets[0].id);
          setPresetDraft(copyPreset(loadedPresets[0]));
        }
      })
      .catch(() => {
        if (active) {
          setPresetError('저장된 편집 설정을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) {
          setPresetsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => setPreviewHeight(entry.contentRect.height));
    observer.observe(preview);
    return () => observer.disconnect();
  }, [presetDraft.aspectRatio]);

  useEffect(
    () =>
      window.localVideoManager.onVideoRenderProgress((progress) => {
        if (activeJobIdRef.current && progress.jobId !== activeJobIdRef.current) {
          return;
        }
        activeJobIdRef.current = progress.jobId;
        setRenderProgress(progress);
        setRenderStarting(false);
        if (progress.status === 'failed') {
          setRenderError(
            progress.errorMessage
              ? `영상 생성에 실패했습니다: ${progress.errorMessage}`
              : '영상 생성에 실패했습니다.',
          );
        }
      }),
    [],
  );

  function selectPreset(presetIdValue: string) {
    setPresetError(null);
    setPresetMessage(null);
    if (!presetIdValue) {
      setSelectedPresetId(null);
      setPresetDraft(createDefaultPreset());
      return;
    }

    const preset = presets.find((candidate) => candidate.id === Number(presetIdValue));
    if (preset) {
      setSelectedPresetId(preset.id);
      setPresetDraft(copyPreset(preset));
    }
  }

  function startNewPreset() {
    setSelectedPresetId(null);
    setPresetDraft((current) => ({ ...copyPreset(current), name: '새 편집 설정' }));
    setPresetMessage(null);
    setPresetError(null);
  }

  async function savePreset() {
    if (!presetDraft.name.trim()) {
      setPresetError('설정 이름을 입력하세요.');
      return;
    }

    setPresetBusy(true);
    setPresetError(null);
    setPresetMessage(null);
    try {
      const saved = selectedPresetId
        ? await window.localVideoManager.updateVideoEditorPreset(selectedPresetId, presetDraft)
        : await window.localVideoManager.createVideoEditorPreset(presetDraft);
      const nextPresets = await window.localVideoManager.getVideoEditorPresets();
      setPresets(nextPresets);
      setSelectedPresetId(saved.id);
      setPresetDraft(copyPreset(saved));
      setPresetMessage(
        selectedPresetId ? '편집 설정을 변경했습니다.' : '새 편집 설정을 저장했습니다.',
      );
    } catch {
      setPresetError('같은 이름의 설정이 있는지 확인한 뒤 다시 저장하세요.');
    } finally {
      setPresetBusy(false);
    }
  }

  async function deletePreset() {
    if (!selectedPresetId || !window.confirm('이 편집 설정을 삭제하시겠습니까?')) {
      return;
    }

    setPresetBusy(true);
    setPresetError(null);
    setPresetMessage(null);
    try {
      await window.localVideoManager.deleteVideoEditorPreset(selectedPresetId);
      const nextPresets = await window.localVideoManager.getVideoEditorPresets();
      setPresets(nextPresets);
      if (nextPresets[0]) {
        setSelectedPresetId(nextPresets[0].id);
        setPresetDraft(copyPreset(nextPresets[0]));
      } else {
        setSelectedPresetId(null);
        setPresetDraft(createDefaultPreset());
      }
      setPresetMessage('편집 설정을 삭제했습니다.');
    } catch {
      setPresetError('편집 설정을 삭제하지 못했습니다.');
    } finally {
      setPresetBusy(false);
    }
  }

  function changePlatform(platform: VideoEditorPlatform) {
    const ratios = VIDEO_EDITOR_PLATFORM_RATIOS[platform] as readonly VideoEditorAspectRatio[];
    setPresetDraft((current) => ({
      ...current,
      aspectRatio: ratios.includes(current.aspectRatio) ? current.aspectRatio : ratios[0],
      platform,
    }));
  }

  function addOverlay() {
    const id = crypto.randomUUID();
    const y = clamp(0.16 + overlays.length * 0.08, 0.08, 0.74);
    setOverlays((current) => [
      ...current,
      {
        id,
        region: { height: 0.16, width: 0.76, x: 0.12, y },
        style: { ...presetDraft.defaultTextStyle },
        text: '',
      },
    ]);
    setSelectedOverlayId(id);
  }

  function updateSelectedOverlay(
    update: (overlay: VideoEditorTextOverlay) => VideoEditorTextOverlay,
  ) {
    if (!selectedOverlayId) {
      return;
    }
    setOverlays((current) =>
      current.map((overlay) => (overlay.id === selectedOverlayId ? update(overlay) : overlay)),
    );
  }

  function updateSelectedStyle(update: Partial<VideoEditorTextStyle>) {
    updateSelectedOverlay((overlay) => ({
      ...overlay,
      style: { ...overlay.style, ...update },
    }));
    setPresetDraft((current) => ({
      ...current,
      defaultTextStyle: { ...current.defaultTextStyle, ...update },
    }));
  }

  function deleteOverlay(overlayId: string) {
    setOverlays((current) => current.filter((overlay) => overlay.id !== overlayId));
    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
    }
  }

  function reorderOverlay(overlayId: string, direction: -1 | 1) {
    setOverlays((current) => {
      const currentIndex = current.findIndex((overlay) => overlay.id === overlayId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const currentOverlay = current[currentIndex];
      const targetOverlay = current[targetIndex];
      const reordered = [...current];
      reordered[currentIndex] = {
        ...targetOverlay,
        region: { ...targetOverlay.region, y: currentOverlay.region.y },
      };
      reordered[targetIndex] = {
        ...currentOverlay,
        region: { ...currentOverlay.region, y: targetOverlay.region.y },
      };
      return reordered;
    });
    setSelectedOverlayId(overlayId);
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    overlay: VideoEditorTextOverlay,
    mode: DragState['mode'],
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedOverlayId(overlay.id);
    dragStateRef.current = {
      mode,
      pointerId: event.pointerId,
      region: { ...overlay.region },
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function moveOverlay(event: ReactPointerEvent<HTMLElement>, overlayId: string) {
    const drag = dragStateRef.current;
    const preview = previewRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !preview) {
      return;
    }

    const bounds = preview.getBoundingClientRect();
    const deltaX = (event.clientX - drag.startX) / bounds.width;
    const deltaY = (event.clientY - drag.startY) / bounds.height;
    setOverlays((current) =>
      current.map((overlay) => {
        if (overlay.id !== overlayId) {
          return overlay;
        }

        const region =
          drag.mode === 'move'
            ? {
                ...drag.region,
                x: clamp(drag.region.x + deltaX, 0, 1 - drag.region.width),
                y: clamp(drag.region.y + deltaY, 0, 1 - drag.region.height),
              }
            : {
                ...drag.region,
                height: clamp(drag.region.height + deltaY, 0.06, 1 - drag.region.y),
                width: clamp(drag.region.width + deltaX, 0.12, 1 - drag.region.x),
              };
        return { ...overlay, region };
      }),
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  }

  function toggleVideoPlayback() {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    if (element.paused) {
      void element.play().catch(() => setVideoPaused(true));
    } else {
      element.pause();
    }
  }

  function seekVideo(seconds: number) {
    const element = videoRef.current;
    if (!element || !Number.isFinite(seconds)) {
      return;
    }

    element.currentTime = seconds;
    setVideoCurrentTime(seconds);
  }

  function toggleVideoMuted() {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    element.muted = !element.muted;
    setVideoMuted(element.muted);
  }

  function toggleVideoFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    if (playerRef.current) {
      void playerRef.current.requestFullscreen();
    }
  }

  async function startRender() {
    setRenderStarting(true);
    setRenderError(null);
    setRenderProgress(null);
    activeJobIdRef.current = null;
    try {
      const overlayImageDataUrl = await createOverlayImageDataUrl(
        overlays,
        presetDraft.aspectRatio,
      );
      const result = await window.localVideoManager.startVideoRender(video.contentHash, {
        aspectRatio: presetDraft.aspectRatio,
        letterboxColor: presetDraft.letterboxColor,
        overlayImageDataUrl,
        resizeMode: presetDraft.resizeMode,
      });
      if (result.cancelled || !result.jobId || !result.outputPath) {
        setRenderStarting(false);
        return;
      }

      const { jobId, outputPath } = result;
      activeJobIdRef.current = jobId;
      setRenderProgress((current) =>
        current?.jobId === jobId
          ? current
          : {
              errorMessage: null,
              jobId,
              outputPath,
              progress: 0,
              status: 'running',
            },
      );
    } catch {
      setRenderStarting(false);
      setRenderError('저장 위치와 원본 영상 상태를 확인한 뒤 다시 시도하세요.');
    }
  }

  async function cancelRender() {
    if (!activeJobIdRef.current) {
      return;
    }
    try {
      await window.localVideoManager.cancelVideoRender(activeJobIdRef.current);
    } catch {
      setRenderError('진행 중인 영상 생성을 취소하지 못했습니다.');
    }
  }

  async function revealRenderedVideo() {
    if (!renderProgress?.jobId) {
      return;
    }
    try {
      await window.localVideoManager.revealRenderedVideo(renderProgress.jobId);
    } catch {
      setRenderError('생성된 영상 위치를 열지 못했습니다.');
    }
  }

  return (
    <main className="video-editor-shell">
      <header className="video-editor-topbar">
        <button
          className="video-editor-back-button"
          type="button"
          onClick={onBack}
          disabled={rendering}
        >
          <span aria-hidden="true">←</span>
          영상 목록
        </button>
        <div className="video-editor-heading">
          <span>VIDEO EDITOR</span>
          <h1 title={video.fileName}>{video.fileName}</h1>
        </div>
        <button
          className="primary-button video-editor-render-button"
          type="button"
          onClick={() => void startRender()}
          disabled={rendering || presetsLoading || !video.fileAvailable}
        >
          {rendering ? '영상 만드는 중…' : '편집 영상 만들기'}
        </button>
      </header>

      <div className="video-editor-layout">
        <aside className="video-editor-sidebar">
          <section className="video-editor-panel">
            <div className="video-editor-panel-heading">
              <div>
                <span>PRESET</span>
                <h2>편집 설정</h2>
              </div>
              <button type="button" onClick={startNewPreset} disabled={presetBusy || rendering}>
                새 설정
              </button>
            </div>
            <label className="video-editor-field">
              <span>저장된 설정</span>
              <select
                value={selectedPresetId ?? ''}
                onChange={(event) => selectPreset(event.target.value)}
                disabled={presetsLoading || presetBusy || rendering}
              >
                <option value="">저장하지 않은 설정</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="video-editor-field">
              <span>설정 이름</span>
              <input
                value={presetDraft.name}
                onChange={(event) =>
                  setPresetDraft((current) => ({ ...current, name: event.target.value }))
                }
                maxLength={VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH}
                disabled={presetBusy || rendering}
              />
            </label>
            <div className="video-editor-preset-actions">
              <button
                className="video-editor-secondary-button"
                type="button"
                onClick={() => void deletePreset()}
                disabled={!selectedPresetId || presetBusy || rendering}
              >
                삭제
              </button>
              <button
                className="video-editor-save-button"
                type="button"
                onClick={() => void savePreset()}
                disabled={presetBusy || rendering}
              >
                {presetBusy ? '저장 중…' : selectedPresetId ? '변경 저장' : '새로 저장'}
              </button>
            </div>
            {presetMessage ? <p className="video-editor-success">{presetMessage}</p> : null}
            {presetError ? (
              <p className="video-editor-error" role="alert">
                {presetError}
              </p>
            ) : null}
          </section>

          <section className="video-editor-panel">
            <div className="video-editor-panel-heading">
              <div>
                <span>OUTPUT</span>
                <h2>플랫폼 설정</h2>
              </div>
              <small>
                {outputSize.width} × {outputSize.height}
              </small>
            </div>
            <div className="video-editor-field-row">
              <label className="video-editor-field">
                <span>플랫폼</span>
                <select
                  value={presetDraft.platform}
                  onChange={(event) => changePlatform(event.target.value as VideoEditorPlatform)}
                  disabled={rendering}
                >
                  {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="video-editor-field">
                <span>화면 비율</span>
                <select
                  value={presetDraft.aspectRatio}
                  onChange={(event) =>
                    setPresetDraft((current) => ({
                      ...current,
                      aspectRatio: event.target.value as VideoEditorAspectRatio,
                    }))
                  }
                  disabled={rendering}
                >
                  {supportedRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="video-editor-segmented-field" disabled={rendering}>
              <legend>영상 맞춤</legend>
              <label>
                <input
                  type="radio"
                  name="resize-mode"
                  value="crop"
                  checked={presetDraft.resizeMode === 'crop'}
                  onChange={() => setPresetDraft((current) => ({ ...current, resizeMode: 'crop' }))}
                />
                <span>화면 채우기</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="resize-mode"
                  value="letterbox"
                  checked={presetDraft.resizeMode === 'letterbox'}
                  onChange={() =>
                    setPresetDraft((current) => ({ ...current, resizeMode: 'letterbox' }))
                  }
                />
                <span>전체 보이기</span>
              </label>
            </fieldset>
            {presetDraft.resizeMode === 'letterbox' ? (
              <label className="video-editor-color-field">
                <span>여백 색상</span>
                <input
                  type="color"
                  value={presetDraft.letterboxColor}
                  onChange={(event) =>
                    setPresetDraft((current) => ({
                      ...current,
                      letterboxColor: event.target.value.toUpperCase(),
                    }))
                  }
                  disabled={rendering}
                />
                <code>{presetDraft.letterboxColor}</code>
              </label>
            ) : null}
          </section>

          <section className="video-editor-panel video-editor-text-panel">
            <div className="video-editor-panel-heading">
              <div>
                <span>TEXT REPLACEMENT</span>
                <h2>텍스트 교체 영역</h2>
              </div>
              <button type="button" onClick={addOverlay} disabled={rendering}>
                + 영역 추가
              </button>
            </div>
            {overlays.length === 0 ? (
              <button className="video-editor-empty-regions" type="button" onClick={addOverlay}>
                영상 위에서 교체할 텍스트 영역을 추가하세요.
              </button>
            ) : (
              <ol className="video-editor-region-list">
                {overlays.map((overlay, index) => (
                  <li
                    className={overlay.id === selectedOverlayId ? 'selected' : undefined}
                    key={overlay.id}
                  >
                    <button type="button" onClick={() => setSelectedOverlayId(overlay.id)}>
                      <strong>영역 {index + 1}</strong>
                      <span>{overlay.text || '텍스트 미입력'}</span>
                    </button>
                    <div className="video-editor-region-order">
                      <button
                        type="button"
                        onClick={() => reorderOverlay(overlay.id, -1)}
                        disabled={index === 0 || rendering}
                        aria-label={`영역 ${index + 1} 위로 이동`}
                        title="위로 이동"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => reorderOverlay(overlay.id, 1)}
                        disabled={index === overlays.length - 1 || rendering}
                        aria-label={`영역 ${index + 1} 아래로 이동`}
                        title="아래로 이동"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      className="video-editor-region-delete"
                      type="button"
                      onClick={() => deleteOverlay(overlay.id)}
                      aria-label={`영역 ${index + 1} 삭제`}
                      title="영역 삭제"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {selectedOverlay ? (
              <div className="video-editor-text-controls">
                <label className="video-editor-field">
                  <span>교체 텍스트</span>
                  <textarea
                    value={selectedOverlay.text}
                    onChange={(event) =>
                      updateSelectedOverlay((overlay) => ({
                        ...overlay,
                        text: event.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="새로 표시할 텍스트를 입력하세요."
                    disabled={rendering}
                  />
                </label>
                <div className="video-editor-color-row">
                  <label className="video-editor-color-field">
                    <span>글자</span>
                    <input
                      type="color"
                      value={selectedOverlay.style.textColor}
                      onChange={(event) =>
                        updateSelectedStyle({ textColor: event.target.value.toUpperCase() })
                      }
                      disabled={rendering}
                    />
                  </label>
                  <label className="video-editor-color-field">
                    <span>배경</span>
                    <input
                      type="color"
                      value={selectedOverlay.style.backgroundColor}
                      onChange={(event) =>
                        updateSelectedStyle({ backgroundColor: event.target.value.toUpperCase() })
                      }
                      disabled={rendering}
                    />
                  </label>
                </div>
                <label className="video-editor-range-field">
                  <span>
                    글자 크기 <strong>{selectedOverlay.style.fontSizePercent.toFixed(1)}%</strong>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={selectedOverlay.style.fontSizePercent}
                    onChange={(event) =>
                      updateSelectedStyle({ fontSizePercent: Number(event.target.value) })
                    }
                    disabled={rendering}
                  />
                </label>
                <label className="video-editor-range-field">
                  <span>
                    배경 불투명도{' '}
                    <strong>{Math.round(selectedOverlay.style.backgroundOpacity * 100)}%</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedOverlay.style.backgroundOpacity}
                    onChange={(event) =>
                      updateSelectedStyle({ backgroundOpacity: Number(event.target.value) })
                    }
                    disabled={rendering}
                  />
                </label>
                <div className="video-editor-field-row">
                  <label className="video-editor-field">
                    <span>굵기</span>
                    <select
                      value={selectedOverlay.style.fontWeight}
                      onChange={(event) =>
                        updateSelectedStyle({
                          fontWeight: Number(event.target.value) as 400 | 700 | 900,
                        })
                      }
                      disabled={rendering}
                    >
                      <option value="400">보통</option>
                      <option value="700">굵게</option>
                      <option value="900">아주 굵게</option>
                    </select>
                  </label>
                  <label className="video-editor-field">
                    <span>정렬</span>
                    <select
                      value={selectedOverlay.style.textAlign}
                      onChange={(event) =>
                        updateSelectedStyle({
                          textAlign: event.target.value as 'left' | 'center' | 'right',
                        })
                      }
                      disabled={rendering}
                    >
                      <option value="left">왼쪽</option>
                      <option value="center">가운데</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        <section className="video-editor-workspace">
          <div className="video-editor-preview-heading">
            <div>
              <span>PREVIEW</span>
              <h2>결과 미리보기</h2>
            </div>
            <p>영역을 드래그해 이동하고 우측 아래 점으로 크기를 조절하세요.</p>
          </div>
          <div className="video-editor-preview-area">
            <div className="video-editor-player" ref={playerRef}>
              <div
                className="video-editor-stage"
                ref={previewRef}
                style={{
                  aspectRatio: `${outputSize.width} / ${outputSize.height}`,
                  backgroundColor: presetDraft.letterboxColor,
                }}
                onPointerDown={() => setSelectedOverlayId(null)}
              >
                {video.playbackUrl ? (
                  <video
                    ref={videoRef}
                    src={video.playbackUrl}
                    poster={video.thumbnailDataUrl ?? undefined}
                    preload="metadata"
                    style={{ objectFit: presetDraft.resizeMode === 'crop' ? 'cover' : 'contain' }}
                    onDurationChange={(event) =>
                      setVideoDuration(
                        Number.isFinite(event.currentTarget.duration)
                          ? event.currentTarget.duration
                          : 0,
                      )
                    }
                    onLoadedMetadata={(event) => {
                      setVideoCurrentTime(event.currentTarget.currentTime);
                      setVideoDuration(
                        Number.isFinite(event.currentTarget.duration)
                          ? event.currentTarget.duration
                          : 0,
                      );
                      setVideoMuted(event.currentTarget.muted);
                      setVideoPaused(event.currentTarget.paused);
                    }}
                    onPause={() => setVideoPaused(true)}
                    onPlay={() => setVideoPaused(false)}
                    onTimeUpdate={(event) => setVideoCurrentTime(event.currentTarget.currentTime)}
                    onVolumeChange={(event) => setVideoMuted(event.currentTarget.muted)}
                  />
                ) : (
                  <div className="video-editor-missing-video">원본 영상을 찾을 수 없습니다.</div>
                )}
                {overlays.map((overlay, index) => (
                  <div
                    className={
                      overlay.id === selectedOverlayId
                        ? 'video-editor-overlay selected'
                        : 'video-editor-overlay'
                    }
                    key={overlay.id}
                    style={{
                      backgroundColor: hexToRgba(
                        overlay.style.backgroundColor,
                        overlay.style.backgroundOpacity,
                      ),
                      color: overlay.style.textColor,
                      fontSize: `${Math.max(9, (previewHeight * overlay.style.fontSizePercent) / 100)}px`,
                      fontWeight: overlay.style.fontWeight,
                      height: `${overlay.region.height * 100}%`,
                      left: `${overlay.region.x * 100}%`,
                      textAlign: overlay.style.textAlign,
                      top: `${overlay.region.y * 100}%`,
                      width: `${overlay.region.width * 100}%`,
                    }}
                    onPointerDown={(event) => beginDrag(event, overlay, 'move')}
                    onPointerMove={(event) => moveOverlay(event, overlay.id)}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onLostPointerCapture={endDrag}
                  >
                    <span>{overlay.text || `영역 ${index + 1} · 텍스트 입력`}</span>
                    {overlay.id === selectedOverlayId ? (
                      <button
                        className="video-editor-resize-handle"
                        type="button"
                        onPointerDown={(event) => beginDrag(event, overlay, 'resize')}
                        onPointerMove={(event) => moveOverlay(event, overlay.id)}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onLostPointerCapture={endDrag}
                        aria-label={`영역 ${index + 1} 크기 조절`}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
              {video.playbackUrl ? (
                <div className="video-editor-media-controls">
                  <button
                    type="button"
                    onClick={toggleVideoPlayback}
                    aria-label={videoPaused ? '영상 재생' : '영상 일시정지'}
                    title={videoPaused ? '재생' : '일시정지'}
                  >
                    {videoPaused ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
                      </svg>
                    )}
                  </button>
                  <span className="video-editor-media-time">
                    {formatMediaTime(videoCurrentTime)} / {formatMediaTime(videoDuration)}
                  </span>
                  <input
                    className="video-editor-media-seek"
                    type="range"
                    min="0"
                    max={videoDuration || 0}
                    step="0.01"
                    value={Math.min(videoCurrentTime, videoDuration || 0)}
                    onChange={(event) => seekVideo(Number(event.target.value))}
                    aria-label="영상 재생 위치"
                  />
                  <button
                    type="button"
                    onClick={toggleVideoMuted}
                    aria-label={videoMuted ? '영상 소리 켜기' : '영상 음소거'}
                    title={videoMuted ? '소리 켜기' : '음소거'}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 9v6h4l5 4V5L8 9H4zm11.5 1.4v3.2c.9-.4 1.5-1 1.5-1.6s-.6-1.2-1.5-1.6z" />
                      {videoMuted ? <path d="m17 9 4 6m0-6-4 6" className="stroke" /> : null}
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={toggleVideoFullscreen}
                    aria-label="영상 전체 화면"
                    title="전체 화면"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" className="stroke" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <section className="video-editor-render-status" aria-live="polite">
            <div className="video-editor-render-copy">
              <span>LOCAL RENDER</span>
              <strong>
                {renderProgress?.status === 'completed'
                  ? '편집 영상을 만들었습니다.'
                  : renderProgress?.status === 'cancelled'
                    ? '영상 생성을 취소했습니다.'
                    : renderProgress?.status === 'failed'
                      ? '영상 생성에 실패했습니다.'
                      : rendering
                        ? `영상을 만드는 중입니다 · ${renderProgress?.progress ?? 0}%`
                        : '원본 파일은 그대로 두고 새 MP4 파일을 만듭니다.'}
              </strong>
              {renderProgress?.outputPath ? (
                <small title={renderProgress.outputPath}>{renderProgress.outputPath}</small>
              ) : null}
              {renderError ? (
                <p className="video-editor-error" role="alert">
                  {renderError}
                </p>
              ) : null}
            </div>
            {rendering ? (
              <button
                className="video-editor-secondary-button"
                type="button"
                onClick={() => void cancelRender()}
                disabled={renderStarting || !activeJobIdRef.current}
              >
                생성 취소
              </button>
            ) : renderProgress?.status === 'completed' ? (
              <button
                className="video-editor-save-button"
                type="button"
                onClick={() => void revealRenderedVideo()}
              >
                파일 위치 열기
              </button>
            ) : null}
            <div className="video-editor-progress-track" aria-hidden="true">
              <span style={{ width: `${renderProgress?.progress ?? 0}%` }} />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
