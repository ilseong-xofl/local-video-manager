import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  VIDEO_EDITOR_FONT_MARKET_LABELS,
  VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET,
  VIDEO_EDITOR_OUTPUT_SIZES,
  VIDEO_EDITOR_PLATFORM_RATIOS,
  VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH,
  VIDEO_EDITOR_TEXT_PRESET_LIMIT,
  getDefaultVideoEditorFontFamily,
  isVideoEditorFontFamily,
  type LibraryVideoItem,
  type VideoEditorAspectRatio,
  type VideoEditorFontMarket,
  type VideoEditorPlatform,
  type VideoEditorPreset,
  type VideoEditorPresetInput,
  type VideoEditorRegion,
  type VideoEditorTextOverlay,
  type VideoEditorTextPreset,
  type VideoEditorTextStyle,
  type VideoRenderProgress,
} from '../shared/contracts';
import { fitPreviewStage } from './video-editor-layout';
import { getOverlaySelectionAfterDelete } from './video-editor-overlays';

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

type PresetDialogMode = 'create' | 'edit';
type TextPresetDialogMode = 'choice' | 'create' | 'rename';
type PlatformSettings = Pick<
  VideoEditorPresetInput,
  'aspectRatio' | 'letterboxColor' | 'platform' | 'resizeMode'
>;

const MEDIA_CONTROLS_HEIGHT = 42;
const MAX_PREVIEW_STAGE_HEIGHT = 680;

const PLATFORM_LABELS: Record<VideoEditorPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
};

const DEFAULT_TEXT_STYLE: VideoEditorTextStyle = {
  backgroundColor: '#111111',
  backgroundOpacity: 1,
  fontFamily: 'Noto Sans KR',
  fontMarket: 'KR',
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
    resizeMode: 'letterbox',
  };
}

function copyPreset(preset: VideoEditorPresetInput): VideoEditorPresetInput {
  return {
    aspectRatio: preset.aspectRatio,
    defaultTextStyle: { ...preset.defaultTextStyle },
    letterboxColor: preset.letterboxColor,
    name: preset.name,
    platform: preset.platform,
    resizeMode: preset.resizeMode,
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

function formatFontFamily(fontFamily: string): string {
  return `"${fontFamily}", sans-serif`;
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

  const fontDescriptors = new Set(
    overlays.map(
      (overlay) => `${overlay.style.fontWeight} 16px ${formatFontFamily(overlay.style.fontFamily)}`,
    ),
  );
  await Promise.all(
    Array.from(fontDescriptors, (fontDescriptor) => document.fonts.load(fontDescriptor)),
  );
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
      context.font = `${overlay.style.fontWeight} ${fontSize}px ${formatFontFamily(overlay.style.fontFamily)}`;
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
  const [presetDialogMode, setPresetDialogMode] = useState<PresetDialogMode | null>(null);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformMessage, setPlatformMessage] = useState<string | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [textPresets, setTextPresets] = useState<VideoEditorTextPreset[]>([]);
  const [selectedTextPresetId, setSelectedTextPresetId] = useState<number | null>(null);
  const [textPresetsLoading, setTextPresetsLoading] = useState(true);
  const [textPresetBusy, setTextPresetBusy] = useState(false);
  const [textPresetMessage, setTextPresetMessage] = useState<string | null>(null);
  const [textPresetError, setTextPresetError] = useState<string | null>(null);
  const [textPresetDialogMode, setTextPresetDialogMode] = useState<TextPresetDialogMode | null>(
    null,
  );
  const [textPresetNameInput, setTextPresetNameInput] = useState('');
  const [overlays, setOverlays] = useState<VideoEditorTextOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [previewAreaSize, setPreviewAreaSize] = useState({ height: 0, width: 0 });
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoPaused, setVideoPaused] = useState(true);
  const [renderStarting, setRenderStarting] = useState(false);
  const [renderProgress, setRenderProgress] = useState<VideoRenderProgress | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const selectedOverlay = useMemo(
    () => overlays.find((overlay) => overlay.id === selectedOverlayId) ?? null,
    [overlays, selectedOverlayId],
  );
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );
  const selectedTextPreset = useMemo(
    () => textPresets.find((preset) => preset.id === selectedTextPresetId) ?? null,
    [selectedTextPresetId, textPresets],
  );
  const supportedRatios = VIDEO_EDITOR_PLATFORM_RATIOS[
    presetDraft.platform
  ] as readonly VideoEditorAspectRatio[];
  const outputSize = VIDEO_EDITOR_OUTPUT_SIZES[presetDraft.aspectRatio];
  const previewStageSize = useMemo(
    () =>
      fitPreviewStage({
        aspectHeight: outputSize.height,
        aspectWidth: outputSize.width,
        availableHeight: previewAreaSize.height,
        availableWidth: previewAreaSize.width,
        controlsHeight: video.playbackUrl ? MEDIA_CONTROLS_HEIGHT : 0,
        maxStageHeight: MAX_PREVIEW_STAGE_HEIGHT,
      }),
    [outputSize.height, outputSize.width, previewAreaSize, video.playbackUrl],
  );
  const previewHeight = previewStageSize?.height ?? 0;
  const rendering = renderStarting || renderProgress?.status === 'running';
  const showRenderStatus = rendering || renderProgress !== null || renderError !== null;

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
    let active = true;
    void window.localVideoManager
      .getVideoEditorTextPresets()
      .then((loadedPresets) => {
        if (active) {
          setTextPresets(loadedPresets);
        }
      })
      .catch(() => {
        if (active) {
          setTextPresetError('텍스트 프리셋을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) {
          setTextPresetsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!presetDialogMode) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !presetBusy) {
        setPresetDialogMode(null);
        setPresetError(null);
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [presetBusy, presetDialogMode]);

  useEffect(() => {
    if (!presetMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setPresetMessage(null), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [presetMessage]);

  useEffect(() => {
    if (!platformMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setPlatformMessage(null), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [platformMessage]);

  useEffect(() => {
    if (!textPresetDialogMode) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !textPresetBusy) {
        setTextPresetDialogMode(null);
        setTextPresetError(null);
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [textPresetBusy, textPresetDialogMode]);

  useEffect(() => {
    if (!textPresetMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setTextPresetMessage(null), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [textPresetMessage]);

  useEffect(() => {
    const previewArea = previewAreaRef.current;
    if (!previewArea) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setPreviewAreaSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });
    observer.observe(previewArea);
    return () => observer.disconnect();
  }, []);

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
    setPlatformError(null);
    setPlatformMessage(null);
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

  function openCreatePresetDialog() {
    setPresetNameInput('');
    setPresetDialogMode('create');
    setPresetMessage(null);
    setPresetError(null);
  }

  function openEditPresetDialog() {
    if (!selectedPresetId) {
      return;
    }

    setPresetNameInput(presetDraft.name);
    setPresetDialogMode('edit');
    setPresetMessage(null);
    setPresetError(null);
  }

  function closePresetDialog() {
    if (presetBusy) {
      return;
    }

    setPresetDialogMode(null);
    setPresetError(null);
  }

  async function submitPresetDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = presetNameInput.trim();
    if (!name) {
      setPresetError('설정 이름을 입력하세요.');
      return;
    }

    if (!presetDialogMode || (presetDialogMode === 'edit' && !selectedPreset)) {
      return;
    }

    setPresetBusy(true);
    setPresetError(null);
    setPresetMessage(null);
    try {
      const input = {
        ...copyPreset(presetDialogMode === 'edit' ? selectedPreset! : presetDraft),
        name,
      };
      const saved =
        presetDialogMode === 'edit'
          ? await window.localVideoManager.updateVideoEditorPreset(selectedPreset!.id, input)
          : await window.localVideoManager.createVideoEditorPreset(input);
      const nextPresets = await window.localVideoManager.getVideoEditorPresets();
      setPresets(nextPresets);
      setSelectedPresetId(saved.id);
      setPresetDraft((current) =>
        presetDialogMode === 'edit' ? { ...current, name: saved.name } : copyPreset(saved),
      );
      setPresetMessage(
        presetDialogMode === 'edit' ? '편집 설정을 변경했습니다.' : '편집 설정을 등록했습니다.',
      );
      setPresetDialogMode(null);
    } catch {
      setPresetError('같은 이름의 설정이 있는지 확인한 뒤 다시 시도하세요.');
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
    setPlatformMessage(null);
    setPlatformError(null);
    setPresetDraft((current) => ({
      ...current,
      aspectRatio: ratios.includes(current.aspectRatio) ? current.aspectRatio : ratios[0],
      platform,
    }));
  }

  function updatePlatformDraft(update: Partial<PlatformSettings>) {
    setPlatformMessage(null);
    setPlatformError(null);
    setPresetDraft((current) => ({ ...current, ...update }));
  }

  async function savePlatformSettings() {
    if (!selectedPreset) {
      setPlatformError('편집 설정을 먼저 등록하세요.');
      return;
    }

    setPlatformSaving(true);
    setPlatformMessage(null);
    setPlatformError(null);
    try {
      const saved = await window.localVideoManager.updateVideoEditorPreset(selectedPreset.id, {
        aspectRatio: presetDraft.aspectRatio,
        defaultTextStyle: { ...selectedPreset.defaultTextStyle },
        letterboxColor: presetDraft.letterboxColor,
        name: selectedPreset.name,
        platform: presetDraft.platform,
        resizeMode: presetDraft.resizeMode,
      });
      const nextPresets = await window.localVideoManager.getVideoEditorPresets();
      setPresets(nextPresets);
      setPresetDraft((current) => ({
        ...current,
        aspectRatio: saved.aspectRatio,
        letterboxColor: saved.letterboxColor,
        name: saved.name,
        platform: saved.platform,
        resizeMode: saved.resizeMode,
      }));
      setPlatformMessage('플랫폼 설정을 저장했습니다.');
    } catch {
      setPlatformError('플랫폼 설정을 저장하지 못했습니다.');
    } finally {
      setPlatformSaving(false);
    }
  }

  function applyTextPreset(presetIdValue: string) {
    setTextPresetMessage(null);
    setTextPresetError(null);
    if (!presetIdValue) {
      setSelectedTextPresetId(null);
      return;
    }

    const preset = textPresets.find((candidate) => candidate.id === Number(presetIdValue));
    if (!preset) {
      return;
    }

    const nextOverlays = preset.overlays.map((overlay, index) => ({
      id: crypto.randomUUID(),
      region: { ...overlay.region },
      style: { ...overlay.style },
      text: overlays[index]?.text ?? '',
    }));
    setSelectedTextPresetId(preset.id);
    setOverlays(nextOverlays);
    setSelectedOverlayId(nextOverlays[0]?.id ?? null);
  }

  function buildTextPresetInput(name: string) {
    return {
      name,
      overlays: overlays.map((overlay) => ({
        region: { ...overlay.region },
        style: { ...overlay.style },
      })),
    };
  }

  function openTextPresetDialog() {
    setTextPresetMessage(null);
    setTextPresetError(null);
    if (overlays.length === 0) {
      setTextPresetError('저장할 텍스트 영역을 먼저 추가하세요.');
      return;
    }

    if (selectedTextPreset) {
      setTextPresetDialogMode('choice');
      return;
    }

    openNewTextPresetDialog();
  }

  function openNewTextPresetDialog() {
    if (textPresets.length >= VIDEO_EDITOR_TEXT_PRESET_LIMIT) {
      setTextPresetError('텍스트 프리셋은 최대 5개까지 저장할 수 있습니다.');
      return;
    }

    setTextPresetError(null);
    setTextPresetNameInput('');
    setTextPresetDialogMode('create');
  }

  function openRenameTextPresetDialog() {
    if (!selectedTextPreset) {
      return;
    }

    setTextPresetError(null);
    setTextPresetNameInput(selectedTextPreset.name);
    setTextPresetDialogMode('rename');
  }

  function closeTextPresetDialog() {
    if (textPresetBusy) {
      return;
    }

    setTextPresetDialogMode(null);
    setTextPresetError(null);
  }

  async function submitTextPresetDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = textPresetNameInput.trim();
    if (!name) {
      setTextPresetError('프리셋 이름을 입력하세요.');
      return;
    }

    const renaming = textPresetDialogMode === 'rename';
    if (renaming && !selectedTextPreset) {
      return;
    }

    setTextPresetBusy(true);
    setTextPresetMessage(null);
    setTextPresetError(null);
    try {
      const saved = renaming
        ? await window.localVideoManager.updateVideoEditorTextPreset(selectedTextPreset!.id, {
            name,
            overlays: selectedTextPreset!.overlays.map((overlay) => ({
              region: { ...overlay.region },
              style: { ...overlay.style },
            })),
          })
        : await window.localVideoManager.createVideoEditorTextPreset(buildTextPresetInput(name));
      const nextPresets = await window.localVideoManager.getVideoEditorTextPresets();
      setTextPresets(nextPresets);
      setSelectedTextPresetId(saved.id);
      setTextPresetDialogMode(null);
      setTextPresetMessage(
        renaming ? '텍스트 프리셋 이름을 변경했습니다.' : '텍스트 프리셋을 저장했습니다.',
      );
    } catch {
      setTextPresetError('같은 이름의 프리셋이 있는지 확인한 뒤 다시 시도하세요.');
    } finally {
      setTextPresetBusy(false);
    }
  }

  async function updateSelectedTextPreset() {
    if (!selectedTextPreset) {
      return;
    }

    setTextPresetBusy(true);
    setTextPresetMessage(null);
    setTextPresetError(null);
    try {
      const saved = await window.localVideoManager.updateVideoEditorTextPreset(
        selectedTextPreset.id,
        buildTextPresetInput(selectedTextPreset.name),
      );
      const nextPresets = await window.localVideoManager.getVideoEditorTextPresets();
      setTextPresets(nextPresets);
      setSelectedTextPresetId(saved.id);
      setTextPresetDialogMode(null);
      setTextPresetMessage('텍스트 프리셋을 업데이트했습니다.');
    } catch {
      setTextPresetError('텍스트 프리셋을 업데이트하지 못했습니다.');
    } finally {
      setTextPresetBusy(false);
    }
  }

  async function deleteTextPreset() {
    if (!selectedTextPresetId || !window.confirm('이 텍스트 프리셋을 삭제하시겠습니까?')) {
      return;
    }

    setTextPresetBusy(true);
    setTextPresetMessage(null);
    setTextPresetError(null);
    try {
      await window.localVideoManager.deleteVideoEditorTextPreset(selectedTextPresetId);
      const nextPresets = await window.localVideoManager.getVideoEditorTextPresets();
      setTextPresets(nextPresets);
      setSelectedTextPresetId(null);
      setTextPresetMessage('텍스트 프리셋을 삭제했습니다.');
    } catch {
      setTextPresetError('텍스트 프리셋을 삭제하지 못했습니다.');
    } finally {
      setTextPresetBusy(false);
    }
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

  function updateSelectedFontMarket(fontMarket: VideoEditorFontMarket) {
    const currentFontFamily = selectedOverlay?.style.fontFamily ?? '';
    updateSelectedStyle({
      fontFamily: isVideoEditorFontFamily(fontMarket, currentFontFamily)
        ? currentFontFamily
        : getDefaultVideoEditorFontFamily(fontMarket),
      fontMarket,
    });
  }

  function deleteOverlay(overlayId: string) {
    const nextSelectedOverlayId = getOverlaySelectionAfterDelete(
      overlays.map((overlay) => overlay.id),
      overlayId,
    );
    setOverlays((current) => current.filter((overlay) => overlay.id !== overlayId));
    setSelectedOverlayId(nextSelectedOverlayId);
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
      {presetMessage || platformMessage || textPresetMessage ? (
        <div className="video-editor-toast-region" aria-live="polite" aria-atomic="true">
          {presetMessage ? (
            <div className="video-editor-toast" role="status">
              {presetMessage}
            </div>
          ) : null}
          {platformMessage ? (
            <div className="video-editor-toast" role="status">
              {platformMessage}
            </div>
          ) : null}
          {textPresetMessage ? (
            <div className="video-editor-toast" role="status">
              {textPresetMessage}
            </div>
          ) : null}
        </div>
      ) : null}

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
          disabled={rendering || platformSaving || presetsLoading || !video.fileAvailable}
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
              <button
                className="video-editor-preset-register"
                type="button"
                onClick={openCreatePresetDialog}
                disabled={presetBusy || platformSaving || rendering}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                등록
              </button>
            </div>
            <div className="video-editor-preset-row">
              <select
                aria-label="편집 설정"
                value={selectedPresetId ?? ''}
                onChange={(event) => selectPreset(event.target.value)}
                disabled={
                  presetsLoading ||
                  presets.length === 0 ||
                  presetBusy ||
                  platformSaving ||
                  rendering
                }
              >
                <option value="">
                  {presetsLoading
                    ? '설정 불러오는 중'
                    : presets.length === 0
                      ? '설정 없음'
                      : '설정 선택'}
                </option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                className="video-editor-preset-icon-button"
                type="button"
                onClick={openEditPresetDialog}
                disabled={!selectedPresetId || presetBusy || platformSaving || rendering}
                aria-label="편집 설정 수정"
                title="설정 수정"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m4 20 4.1-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.1 16 4 20Z" />
                  <path d="m13.8 7.7 2.5 2.5" />
                </svg>
              </button>
              <button
                className="video-editor-preset-icon-button danger"
                type="button"
                onClick={() => void deletePreset()}
                disabled={!selectedPresetId || presetBusy || platformSaving || rendering}
                aria-label="편집 설정 삭제"
                title="설정 삭제"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>
            {presetError && !presetDialogMode ? (
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
              <button
                className="video-editor-panel-icon-button"
                type="button"
                onClick={() => void savePlatformSettings()}
                disabled={!selectedPreset || platformSaving || rendering}
                aria-label="플랫폼 설정 저장"
                title={selectedPreset ? '플랫폼 설정 저장' : '편집 설정을 먼저 등록하세요'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 4h12l2 2v14H5V4Z" />
                  <path d="M8 4v6h8V4M8 20v-6h8v6" />
                </svg>
              </button>
            </div>
            <div className="video-editor-field-row">
              <label className="video-editor-field">
                <span>플랫폼</span>
                <select
                  value={presetDraft.platform}
                  onChange={(event) => changePlatform(event.target.value as VideoEditorPlatform)}
                  disabled={platformSaving || rendering}
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
                    updatePlatformDraft({
                      aspectRatio: event.target.value as VideoEditorAspectRatio,
                    })
                  }
                  disabled={platformSaving || rendering}
                >
                  {supportedRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="video-editor-radio-field"
              role="group"
              aria-labelledby="video-editor-resize-mode-label"
            >
              <span id="video-editor-resize-mode-label">리사이징 모드</span>
              <div>
                <label>
                  <input
                    type="radio"
                    name="resize-mode"
                    value="letterbox"
                    checked={presetDraft.resizeMode === 'letterbox'}
                    onChange={() => updatePlatformDraft({ resizeMode: 'letterbox' })}
                    disabled={platformSaving || rendering}
                  />
                  <span>레터박스</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="resize-mode"
                    value="crop"
                    checked={presetDraft.resizeMode === 'crop'}
                    onChange={() => updatePlatformDraft({ resizeMode: 'crop' })}
                    disabled={platformSaving || rendering}
                  />
                  <span>크롭</span>
                </label>
              </div>
            </div>
            <fieldset
              className="video-editor-letterbox-field"
              disabled={platformSaving || rendering || presetDraft.resizeMode === 'crop'}
            >
              <legend>레터박스 배경색</legend>
              <div>
                <button
                  className={
                    presetDraft.letterboxColor === '#000000'
                      ? 'video-editor-color-choice selected'
                      : 'video-editor-color-choice'
                  }
                  type="button"
                  onClick={() => updatePlatformDraft({ letterboxColor: '#000000' })}
                  aria-pressed={presetDraft.letterboxColor === '#000000'}
                >
                  <span className="video-editor-color-swatch black" />
                  검정
                </button>
                <button
                  className={
                    presetDraft.letterboxColor === '#FFFFFF'
                      ? 'video-editor-color-choice selected'
                      : 'video-editor-color-choice'
                  }
                  type="button"
                  onClick={() => updatePlatformDraft({ letterboxColor: '#FFFFFF' })}
                  aria-pressed={presetDraft.letterboxColor === '#FFFFFF'}
                >
                  <span className="video-editor-color-swatch white" />
                  흰색
                </button>
                <label
                  className={
                    presetDraft.letterboxColor !== '#000000' &&
                    presetDraft.letterboxColor !== '#FFFFFF'
                      ? 'video-editor-custom-color selected'
                      : 'video-editor-custom-color'
                  }
                >
                  <input
                    type="color"
                    value={presetDraft.letterboxColor}
                    onChange={(event) =>
                      updatePlatformDraft({
                        letterboxColor: event.target.value.toUpperCase(),
                      })
                    }
                    aria-label="사용자 지정 레터박스 배경색"
                  />
                  <span>직접 선택</span>
                </label>
              </div>
            </fieldset>
            {platformError ? (
              <p className="video-editor-error" role="alert">
                {platformError}
              </p>
            ) : null}
          </section>

          <section className="video-editor-panel video-editor-text-panel">
            <div className="video-editor-panel-heading">
              <div>
                <span>TEXT REPLACEMENT</span>
                <h2>텍스트 교체</h2>
              </div>
              <div className="video-editor-panel-actions">
                <button type="button" onClick={addOverlay} disabled={rendering || textPresetBusy}>
                  + 추가
                </button>
                <button
                  className="video-editor-panel-icon-button"
                  type="button"
                  onClick={openTextPresetDialog}
                  disabled={
                    overlays.length === 0 ||
                    (!selectedTextPreset && textPresets.length >= VIDEO_EDITOR_TEXT_PRESET_LIMIT) ||
                    textPresetBusy ||
                    rendering
                  }
                  aria-label={selectedTextPreset ? '텍스트 프리셋 저장 옵션' : '텍스트 프리셋 저장'}
                  title={
                    selectedTextPreset
                      ? '현재 프리셋 업데이트 또는 새 프리셋 저장'
                      : textPresets.length >= VIDEO_EDITOR_TEXT_PRESET_LIMIT
                        ? '텍스트 프리셋은 최대 5개까지 저장할 수 있습니다'
                        : '텍스트 프리셋 저장'
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 4h12l2 2v14H5V4Z" />
                    <path d="M8 4v6h8V4M8 20v-6h8v6" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="video-editor-text-preset-row">
              <select
                aria-label="텍스트 프리셋"
                value={selectedTextPresetId ?? ''}
                onChange={(event) => applyTextPreset(event.target.value)}
                disabled={
                  textPresetsLoading || textPresets.length === 0 || textPresetBusy || rendering
                }
              >
                <option value="">
                  {textPresetsLoading
                    ? '프리셋 불러오는 중'
                    : textPresets.length === 0
                      ? '프리셋 없음'
                      : '프리셋 선택'}
                </option>
                {textPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                className="video-editor-preset-icon-button"
                type="button"
                onClick={openRenameTextPresetDialog}
                disabled={!selectedTextPresetId || textPresetBusy || rendering}
                aria-label="텍스트 프리셋 이름 수정"
                title="텍스트 프리셋 이름 수정"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m4 20 4.1-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.1 16 4 20Z" />
                  <path d="m13.8 7.7 2.5 2.5" />
                </svg>
              </button>
              <button
                className="video-editor-preset-icon-button danger"
                type="button"
                onClick={() => void deleteTextPreset()}
                disabled={!selectedTextPresetId || textPresetBusy || rendering}
                aria-label="텍스트 프리셋 삭제"
                title="텍스트 프리셋 삭제"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>
            {textPresetError && !textPresetDialogMode ? (
              <p className="video-editor-error" role="alert">
                {textPresetError}
              </p>
            ) : null}
            {overlays.length === 0 ? (
              <button
                className="video-editor-empty-regions"
                type="button"
                onClick={addOverlay}
                disabled={rendering || textPresetBusy}
              >
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
                <fieldset className="video-editor-letterbox-field" disabled={rendering}>
                  <legend>배경</legend>
                  <div>
                    <button
                      className={
                        selectedOverlay.style.backgroundColor === '#111111' ||
                        selectedOverlay.style.backgroundColor === '#000000'
                          ? 'video-editor-color-choice selected'
                          : 'video-editor-color-choice'
                      }
                      type="button"
                      onClick={() => updateSelectedStyle({ backgroundColor: '#111111' })}
                      aria-pressed={
                        selectedOverlay.style.backgroundColor === '#111111' ||
                        selectedOverlay.style.backgroundColor === '#000000'
                      }
                    >
                      <span className="video-editor-color-swatch black" />
                      검정
                    </button>
                    <button
                      className={
                        selectedOverlay.style.backgroundColor === '#FFFFFF'
                          ? 'video-editor-color-choice selected'
                          : 'video-editor-color-choice'
                      }
                      type="button"
                      onClick={() => updateSelectedStyle({ backgroundColor: '#FFFFFF' })}
                      aria-pressed={selectedOverlay.style.backgroundColor === '#FFFFFF'}
                    >
                      <span className="video-editor-color-swatch white" />
                      흰색
                    </button>
                    <label
                      className={
                        selectedOverlay.style.backgroundColor !== '#111111' &&
                        selectedOverlay.style.backgroundColor !== '#000000' &&
                        selectedOverlay.style.backgroundColor !== '#FFFFFF'
                          ? 'video-editor-custom-color selected'
                          : 'video-editor-custom-color'
                      }
                    >
                      <input
                        type="color"
                        value={selectedOverlay.style.backgroundColor}
                        onChange={(event) =>
                          updateSelectedStyle({
                            backgroundColor: event.target.value.toUpperCase(),
                          })
                        }
                        aria-label="사용자 지정 텍스트 배경색"
                      />
                      <span>직접 선택</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset className="video-editor-letterbox-field" disabled={rendering}>
                  <legend>글자</legend>
                  <div>
                    <button
                      className={
                        selectedOverlay.style.textColor === '#000000' ||
                        selectedOverlay.style.textColor === '#111111'
                          ? 'video-editor-color-choice selected'
                          : 'video-editor-color-choice'
                      }
                      type="button"
                      onClick={() => updateSelectedStyle({ textColor: '#000000' })}
                      aria-pressed={
                        selectedOverlay.style.textColor === '#000000' ||
                        selectedOverlay.style.textColor === '#111111'
                      }
                    >
                      <span className="video-editor-color-swatch black" />
                      검정
                    </button>
                    <button
                      className={
                        selectedOverlay.style.textColor === '#FFFFFF'
                          ? 'video-editor-color-choice selected'
                          : 'video-editor-color-choice'
                      }
                      type="button"
                      onClick={() => updateSelectedStyle({ textColor: '#FFFFFF' })}
                      aria-pressed={selectedOverlay.style.textColor === '#FFFFFF'}
                    >
                      <span className="video-editor-color-swatch white" />
                      흰색
                    </button>
                    <label
                      className={
                        selectedOverlay.style.textColor !== '#000000' &&
                        selectedOverlay.style.textColor !== '#111111' &&
                        selectedOverlay.style.textColor !== '#FFFFFF'
                          ? 'video-editor-custom-color selected'
                          : 'video-editor-custom-color'
                      }
                    >
                      <input
                        type="color"
                        value={selectedOverlay.style.textColor}
                        onChange={(event) =>
                          updateSelectedStyle({ textColor: event.target.value.toUpperCase() })
                        }
                        aria-label="사용자 지정 글자색"
                      />
                      <span>직접 선택</span>
                    </label>
                  </div>
                </fieldset>
                <div className="video-editor-field-row video-editor-font-row">
                  <label className="video-editor-field">
                    <span>권역</span>
                    <select
                      value={selectedOverlay.style.fontMarket}
                      onChange={(event) =>
                        updateSelectedFontMarket(event.target.value as VideoEditorFontMarket)
                      }
                      disabled={rendering}
                    >
                      {(
                        Object.keys(VIDEO_EDITOR_FONT_MARKET_LABELS) as VideoEditorFontMarket[]
                      ).map((fontMarket) => (
                        <option key={fontMarket} value={fontMarket}>
                          {VIDEO_EDITOR_FONT_MARKET_LABELS[fontMarket]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="video-editor-field">
                    <span>폰트</span>
                    <select
                      value={selectedOverlay.style.fontFamily}
                      onChange={(event) => updateSelectedStyle({ fontFamily: event.target.value })}
                      disabled={rendering}
                      style={{ fontFamily: formatFontFamily(selectedOverlay.style.fontFamily) }}
                    >
                      {VIDEO_EDITOR_FONT_OPTIONS_BY_MARKET[selectedOverlay.style.fontMarket].map(
                        (font) => (
                          <option
                            key={font.value}
                            value={font.value}
                            style={{ fontFamily: formatFontFamily(font.value) }}
                          >
                            {font.label}
                          </option>
                        ),
                      )}
                    </select>
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
          <div className="video-editor-preview-area" ref={previewAreaRef}>
            <div
              className="video-editor-player"
              ref={playerRef}
              style={previewStageSize ? { width: previewStageSize.width } : undefined}
            >
              <div
                className="video-editor-stage"
                ref={previewRef}
                style={{
                  aspectRatio: `${outputSize.width} / ${outputSize.height}`,
                  backgroundColor: presetDraft.letterboxColor,
                  height: previewStageSize?.height,
                  width: previewStageSize ? '100%' : undefined,
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
                      fontFamily: formatFontFamily(overlay.style.fontFamily),
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

          {showRenderStatus ? (
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
                        : renderError
                          ? '영상 생성에 실패했습니다.'
                          : `영상을 만드는 중입니다 · ${renderProgress?.progress ?? 0}%`}
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
          ) : null}
        </section>
      </div>

      {presetDialogMode ? (
        <div
          className="video-editor-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closePresetDialog();
            }
          }}
        >
          <form
            className="video-editor-preset-dialog"
            onSubmit={(event) => void submitPresetDialog(event)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-editor-preset-dialog-title"
            aria-describedby="video-editor-preset-dialog-description"
          >
            <button
              className="video-editor-dialog-close"
              type="button"
              onClick={closePresetDialog}
              disabled={presetBusy}
              aria-label="설정 창 닫기"
            >
              ×
            </button>
            <div className="video-editor-dialog-heading">
              <span>PRESET</span>
              <h2 id="video-editor-preset-dialog-title">
                {presetDialogMode === 'create' ? '설정 추가' : '설정 수정'}
              </h2>
              <p id="video-editor-preset-dialog-description">
                {presetDialogMode === 'create'
                  ? '편집 설정 이름을 등록합니다.'
                  : '편집 설정 이름을 수정합니다.'}
              </p>
            </div>
            <label className="video-editor-dialog-field">
              <span>설정 이름</span>
              <input
                autoFocus
                value={presetNameInput}
                onChange={(event) => setPresetNameInput(event.target.value)}
                placeholder="설정 이름"
                maxLength={VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH}
                disabled={presetBusy}
              />
            </label>
            {presetError ? (
              <p className="video-editor-error" role="alert">
                {presetError}
              </p>
            ) : null}
            <div className="video-editor-dialog-actions">
              <button type="button" onClick={closePresetDialog} disabled={presetBusy}>
                취소
              </button>
              <button className="primary" type="submit" disabled={presetBusy}>
                {presetBusy ? '저장 중…' : presetDialogMode === 'create' ? '등록' : '저장'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {textPresetDialogMode ? (
        <div
          className="video-editor-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeTextPresetDialog();
            }
          }}
        >
          {textPresetDialogMode === 'choice' ? (
            <div
              className="video-editor-preset-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-editor-text-preset-choice-dialog-title"
              aria-describedby="video-editor-text-preset-choice-dialog-description"
            >
              <button
                className="video-editor-dialog-close"
                type="button"
                onClick={closeTextPresetDialog}
                disabled={textPresetBusy}
                aria-label="텍스트 프리셋 저장 방식 창 닫기"
              >
                ×
              </button>
              <div className="video-editor-dialog-heading">
                <span>TEXT PRESET</span>
                <h2 id="video-editor-text-preset-choice-dialog-title">저장 방식 선택</h2>
                <p id="video-editor-text-preset-choice-dialog-description">
                  현재 “{selectedTextPreset?.name}” 프리셋을 업데이트하거나 새 프리셋으로
                  저장합니다.
                </p>
              </div>
              {textPresetError ? (
                <p className="video-editor-error" role="alert">
                  {textPresetError}
                </p>
              ) : null}
              <div className="video-editor-dialog-actions video-editor-preset-choice-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={() => void updateSelectedTextPreset()}
                  disabled={textPresetBusy}
                >
                  {textPresetBusy ? '업데이트 중…' : '현재 프리셋 업데이트'}
                </button>
                <button
                  type="button"
                  onClick={openNewTextPresetDialog}
                  disabled={textPresetBusy || textPresets.length >= VIDEO_EDITOR_TEXT_PRESET_LIMIT}
                  title={
                    textPresets.length >= VIDEO_EDITOR_TEXT_PRESET_LIMIT
                      ? '텍스트 프리셋은 최대 5개까지 저장할 수 있습니다'
                      : undefined
                  }
                >
                  새 프리셋으로 저장
                </button>
                <button
                  className="cancel"
                  type="button"
                  onClick={closeTextPresetDialog}
                  disabled={textPresetBusy}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <form
              className="video-editor-preset-dialog"
              onSubmit={(event) => void submitTextPresetDialog(event)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-editor-text-preset-dialog-title"
              aria-describedby="video-editor-text-preset-dialog-description"
            >
              <button
                className="video-editor-dialog-close"
                type="button"
                onClick={closeTextPresetDialog}
                disabled={textPresetBusy}
                aria-label="텍스트 프리셋 창 닫기"
              >
                ×
              </button>
              <div className="video-editor-dialog-heading">
                <span>TEXT PRESET</span>
                <h2 id="video-editor-text-preset-dialog-title">
                  {textPresetDialogMode === 'rename'
                    ? '텍스트 프리셋 이름 수정'
                    : '새 텍스트 프리셋 저장'}
                </h2>
                <p id="video-editor-text-preset-dialog-description">
                  {textPresetDialogMode === 'rename'
                    ? '저장된 영역과 스타일은 유지하고 프리셋 이름만 변경합니다.'
                    : '텍스트를 제외한 영역 위치·크기와 스타일을 저장합니다.'}
                </p>
              </div>
              <label className="video-editor-dialog-field">
                <span>프리셋 이름</span>
                <input
                  autoFocus
                  value={textPresetNameInput}
                  onChange={(event) => setTextPresetNameInput(event.target.value)}
                  placeholder="프리셋 이름"
                  maxLength={VIDEO_EDITOR_PRESET_NAME_MAX_LENGTH}
                  disabled={textPresetBusy}
                />
              </label>
              {textPresetError ? (
                <p className="video-editor-error" role="alert">
                  {textPresetError}
                </p>
              ) : null}
              <div className="video-editor-dialog-actions">
                <button type="button" onClick={closeTextPresetDialog} disabled={textPresetBusy}>
                  취소
                </button>
                <button className="primary" type="submit" disabled={textPresetBusy}>
                  {textPresetBusy
                    ? '저장 중…'
                    : textPresetDialogMode === 'rename'
                      ? '수정'
                      : '저장'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </main>
  );
}
