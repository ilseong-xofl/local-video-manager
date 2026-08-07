import { useEffect, useRef, useState } from 'react';

import type {
  BootstrapState,
  LibraryVideoReactionFilter,
  LibraryVideoItem,
  LibraryVideoPage,
  LibraryVideoQuery,
  LibraryVideoSortDirection,
  LibraryVideoSortField,
  ManagedVideoTag,
  VideoReaction,
  VideoMetadataDetail,
  VideoMetadataSearchResult,
  VideoScanSummary,
} from '../shared/contracts';
import {
  VIDEO_LIBRARY_SEARCH_MAX_LENGTH,
  VIDEO_METADATA_SEARCH_MAX_LENGTH,
  VIDEO_SOURCE_CAPTION_MAX_LENGTH,
  VIDEO_SOURCE_URL_MAX_LENGTH,
  VIDEO_TAG_NAME_MAX_LENGTH,
} from '../shared/contracts';

type LibrarySortOption = `${LibraryVideoSortField}-${LibraryVideoSortDirection}`;

interface DefaultLibraryFilters {
  dateFrom: string;
  dateTo: string;
  sortOption: LibrarySortOption;
}

const DEFAULT_LIBRARY_SORT_OPTION: LibrarySortOption = 'registeredAt-desc';

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultLibraryFilters(): DefaultLibraryFilters {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setFullYear(dateFrom.getFullYear() - 1);

  return {
    dateFrom: formatDateInput(dateFrom),
    dateTo: formatDateInput(dateTo),
    sortOption: DEFAULT_LIBRARY_SORT_OPTION,
  };
}

function parseDateInput(value: string, endOfDay: boolean): number | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date.getTime();
}

function buildLibraryVideoQuery(
  searchQuery: string,
  sortOption: LibrarySortOption,
  dateFrom: string,
  dateTo: string,
  tagId: number | null,
  reaction: LibraryVideoReactionFilter | null,
): LibraryVideoQuery | null {
  const dateFromMs = parseDateInput(dateFrom, false);
  const dateToMs = parseDateInput(dateTo, true);
  if (dateFromMs === null || dateToMs === null || dateFromMs > dateToMs) {
    return null;
  }

  const [sortField, sortDirection] = sortOption.split('-') as [
    LibraryVideoSortField,
    LibraryVideoSortDirection,
  ];
  return { dateFromMs, dateToMs, reaction, searchQuery, sortDirection, sortField, tagId };
}

function formatScanTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('ko-KR') : '아직 불러오지 않았습니다.';
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatVideoDate(value: number | string): string {
  return new Date(value).toLocaleDateString('ko-KR');
}

function getFolderName(folderPath: string | null): string {
  return folderPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? '영상 폴더';
}

function BrandIcon() {
  return (
    <svg className="brand-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m11 9.5 4 2.5-4 2.5v-5Z" fill="currentColor" />
    </svg>
  );
}

function ReactionIcon({ direction, filled }: { direction: 'up' | 'down'; filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g transform={direction === 'down' ? 'rotate(180 12 12)' : undefined}>
        <path
          d="M8.5 10.2 12 4.5c.7-1.2 2.5-.5 2.2.9l-.7 3.1h4.3a2 2 0 0 1 1.9 2.5l-1.4 5.1a2.5 2.5 0 0 1-2.4 1.9H8.5v-7.8Z"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M4 10.2h4.5V18H4z"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function App() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [backingUpDatabase, setBackingUpDatabase] = useState(false);
  const [restoringDatabase, setRestoringDatabase] = useState(false);
  const [databaseMessage, setDatabaseMessage] = useState<string | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState<VideoScanSummary | null>(null);
  const [scanCompletedOpen, setScanCompletedOpen] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tags, setTags] = useState<ManagedVideoTag[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [pendingDeleteTagId, setPendingDeleteTagId] = useState<number | null>(null);
  const [tagManagerBusy, setTagManagerBusy] = useState(false);
  const [tagManagerError, setTagManagerError] = useState<string | null>(null);
  const [tagManagerMessage, setTagManagerMessage] = useState<string | null>(null);
  const [videoPage, setVideoPage] = useState<LibraryVideoPage | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [defaultLibraryFilters] = useState(createDefaultLibraryFilters);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [librarySortOption, setLibrarySortOption] = useState(defaultLibraryFilters.sortOption);
  const [libraryDateFrom, setLibraryDateFrom] = useState(defaultLibraryFilters.dateFrom);
  const [libraryDateTo, setLibraryDateTo] = useState(defaultLibraryFilters.dateTo);
  const [libraryTagId, setLibraryTagId] = useState<number | null>(null);
  const [libraryReaction, setLibraryReaction] = useState<LibraryVideoReactionFilter | null>(null);
  const [libraryFilterError, setLibraryFilterError] = useState<string | null>(null);
  const [appliedLibraryQuery, setAppliedLibraryQuery] = useState<LibraryVideoQuery>(() => {
    const query = buildLibraryVideoQuery(
      '',
      defaultLibraryFilters.sortOption,
      defaultLibraryFilters.dateFrom,
      defaultLibraryFilters.dateTo,
      null,
      null,
    );
    if (!query) {
      throw new Error('Failed to create the default video library query.');
    }
    return query;
  });
  const [playingVideo, setPlayingVideo] = useState<LibraryVideoItem | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [viewingVideo, setViewingVideo] = useState<LibraryVideoItem | null>(null);
  const [viewingMetadata, setViewingMetadata] = useState<VideoMetadataDetail['current']>(null);
  const [loadingVideoDetails, setLoadingVideoDetails] = useState(false);
  const [videoDetailsError, setVideoDetailsError] = useState<string | null>(null);
  const [savingReactionHash, setSavingReactionHash] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<LibraryVideoItem | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadataDetail | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceCaption, setSourceCaption] = useState('');
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataSaved, setMetadataSaved] = useState(false);
  const [metadataSearchOpen, setMetadataSearchOpen] = useState(false);
  const [metadataSearchQuery, setMetadataSearchQuery] = useState('');
  const [metadataSearchResults, setMetadataSearchResults] = useState<VideoMetadataSearchResult[]>(
    [],
  );
  const [metadataSearchAttempted, setMetadataSearchAttempted] = useState(false);
  const [searchingMetadata, setSearchingMetadata] = useState(false);
  const [metadataSearchError, setMetadataSearchError] = useState<string | null>(null);
  const [copiedFromVideo, setCopiedFromVideo] = useState<VideoMetadataSearchResult | null>(null);
  const [selectedVideoTagIds, setSelectedVideoTagIds] = useState<number[]>([]);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const databaseBusy = backingUpDatabase || restoringDatabase;

  useEffect(() => {
    void window.localVideoManager
      .getTags()
      .then(setTags)
      .catch(() => setError('태그 정보를 불러오지 못했습니다.'));

    void window.localVideoManager
      .getBootstrapState()
      .then((bootstrapState) => {
        setState(bootstrapState);
        const hasScannedLibrary = Boolean(bootstrapState.libraryStats.lastScannedAt);
        setShowLibrary(hasScannedLibrary);
        if (hasScannedLibrary) {
          void loadVideoPage(0, appliedLibraryQuery);
        }
      })
      .catch(() => setError('앱 초기 정보를 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (
      !playingVideo &&
      !viewingVideo &&
      !editingVideo &&
      !tagManagerOpen &&
      !scanningFolder &&
      !scanCompletedOpen
    ) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (playingVideo) {
          closePlayer();
        } else if (viewingVideo) {
          closeVideoDetails();
        } else if (metadataSearchOpen) {
          setMetadataSearchOpen(false);
        } else if (editingVideo) {
          closeMetadataEditor();
        } else if (tagManagerOpen) {
          closeTagManager();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    editingVideo,
    metadataSearchOpen,
    playingVideo,
    scanCompletedOpen,
    scanningFolder,
    tagManagerBusy,
    tagManagerOpen,
    viewingVideo,
  ]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  async function loadVideoPage(pageIndex: number, query = appliedLibraryQuery) {
    setLoadingVideos(true);
    setError(null);

    try {
      setVideoPage(await window.localVideoManager.getLibraryVideoPage(pageIndex, query));
    } catch {
      setError('영상 목록과 썸네일을 불러오지 못했습니다.');
    } finally {
      setLoadingVideos(false);
    }
  }

  async function refreshTags(): Promise<ManagedVideoTag[]> {
    const nextTags = await window.localVideoManager.getTags();
    setTags(nextTags);
    return nextTags;
  }

  async function chooseFolder() {
    setSettingsOpen(false);
    setChoosingFolder(true);
    setError(null);

    try {
      const result = await window.localVideoManager.chooseLibraryRoot();
      const folderChanged = result.state.libraryRoot !== state?.libraryRoot;
      setState(result.state);
      if (!result.cancelled) {
        setScanSummary(null);
        setScanCompletedOpen(false);
        if (folderChanged) {
          setVideoPage(null);
          const hasScannedLibrary = Boolean(result.state.libraryStats.lastScannedAt);
          setShowLibrary(hasScannedLibrary);
          if (hasScannedLibrary) {
            await loadVideoPage(0);
          }
        }
      }
    } catch {
      setError('영상 폴더를 저장하지 못했습니다.');
    } finally {
      setChoosingFolder(false);
    }
  }

  async function scanFolder() {
    setSettingsOpen(false);
    setScanningFolder(true);
    setError(null);
    setScanSummary(null);

    try {
      const result = await window.localVideoManager.scanLibrary();
      setState(result.state);
      setScanSummary(result.summary);
      await loadVideoPage(0);
      setScanCompletedOpen(true);
    } catch {
      setError('영상 폴더를 불러오지 못했습니다. 폴더 접근 권한과 파일 상태를 확인하세요.');
    } finally {
      setScanningFolder(false);
    }
  }

  async function createDatabaseBackup() {
    setSettingsOpen(false);
    setBackingUpDatabase(true);
    setDatabaseMessage(null);
    setDatabaseError(null);

    try {
      const result = await window.localVideoManager.createDatabaseBackup();
      if (!result.cancelled && result.filePath) {
        setDatabaseMessage(`DB 백업을 저장했습니다: ${result.filePath}`);
      }
    } catch {
      setDatabaseError('DB 백업을 만들지 못했습니다. 저장 위치와 파일 권한을 확인하세요.');
    } finally {
      setBackingUpDatabase(false);
    }
  }

  async function restoreDatabaseBackup() {
    setSettingsOpen(false);
    setRestoringDatabase(true);
    setDatabaseMessage(null);
    setDatabaseError(null);

    try {
      const result = await window.localVideoManager.restoreDatabaseBackup();
      if (!result.cancelled) {
        setDatabaseMessage('DB 복원이 준비되었습니다. 앱을 재시작합니다.');
      }
    } catch {
      setDatabaseError('올바른 Local Video Manager 백업 파일인지 확인한 뒤 다시 시도하세요.');
    } finally {
      setRestoringDatabase(false);
    }
  }

  function openTagManager() {
    setSettingsOpen(false);
    setTagManagerOpen(true);
    setNewTagName('');
    setEditingTagId(null);
    setEditingTagName('');
    setPendingDeleteTagId(null);
    setTagManagerError(null);
    setTagManagerMessage(null);
  }

  function closeTagManager() {
    if (tagManagerBusy) {
      return;
    }

    setTagManagerOpen(false);
    setEditingTagId(null);
    setPendingDeleteTagId(null);
    setTagManagerError(null);
    setTagManagerMessage(null);
  }

  async function createTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTagName.trim()) {
      return;
    }

    setTagManagerBusy(true);
    setTagManagerError(null);
    setTagManagerMessage(null);
    try {
      const created = await window.localVideoManager.createTag(newTagName);
      await refreshTags();
      setNewTagName('');
      setTagManagerMessage(`‘${created.name}’ 태그를 만들었습니다.`);
    } catch {
      setTagManagerError('같은 이름의 태그가 있거나 사용할 수 없는 이름입니다.');
    } finally {
      setTagManagerBusy(false);
    }
  }

  function beginRenamingTag(tag: ManagedVideoTag) {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setPendingDeleteTagId(null);
    setTagManagerError(null);
    setTagManagerMessage(null);
  }

  async function renameTag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTagId || !editingTagName.trim()) {
      return;
    }

    setTagManagerBusy(true);
    setTagManagerError(null);
    setTagManagerMessage(null);
    try {
      const renamed = await window.localVideoManager.renameTag(editingTagId, editingTagName);
      await refreshTags();
      setVideoPage((currentPage) =>
        currentPage
          ? {
              ...currentPage,
              items: currentPage.items.map((video) => ({
                ...video,
                tags: video.tags.map((tag) =>
                  tag.id === renamed.id ? { id: renamed.id, name: renamed.name } : tag,
                ),
              })),
            }
          : currentPage,
      );
      setEditingTagId(null);
      setEditingTagName('');
      setTagManagerMessage(`‘${renamed.name}’ 태그로 수정했습니다.`);
    } catch {
      setTagManagerError('같은 이름의 태그가 있거나 사용할 수 없는 이름입니다.');
    } finally {
      setTagManagerBusy(false);
    }
  }

  async function deleteTag(tag: ManagedVideoTag) {
    setTagManagerBusy(true);
    setTagManagerError(null);
    setTagManagerMessage(null);
    try {
      await window.localVideoManager.deleteTag(tag.id);
      await refreshTags();
      setPendingDeleteTagId(null);
      setLibraryTagId((currentTagId) => (currentTagId === tag.id ? null : currentTagId));
      setSelectedVideoTagIds((tagIds) => tagIds.filter((tagId) => tagId !== tag.id));
      setVideoPage((currentPage) =>
        currentPage
          ? {
              ...currentPage,
              items: currentPage.items.map((video) => ({
                ...video,
                tags: video.tags.filter((videoTag) => videoTag.id !== tag.id),
              })),
            }
          : currentPage,
      );

      if (appliedLibraryQuery.tagId === tag.id) {
        const nextQuery = { ...appliedLibraryQuery, tagId: null };
        setLibraryTagId(null);
        setAppliedLibraryQuery(nextQuery);
        await loadVideoPage(0, nextQuery);
      }
      setTagManagerMessage(`‘${tag.name}’ 태그를 삭제했습니다. 영상 정보는 그대로 유지됩니다.`);
    } catch {
      setTagManagerError('태그를 삭제하지 못했습니다. 다시 시도하세요.');
    } finally {
      setTagManagerBusy(false);
    }
  }

  async function applyLibraryFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = buildLibraryVideoQuery(
      librarySearchQuery,
      librarySortOption,
      libraryDateFrom,
      libraryDateTo,
      libraryTagId,
      libraryReaction,
    );
    if (!query) {
      setLibraryFilterError('시작일은 종료일보다 늦을 수 없습니다. 날짜 범위를 확인하세요.');
      return;
    }

    setLibraryFilterError(null);
    setAppliedLibraryQuery(query);
    await loadVideoPage(0, query);
  }

  async function updateVideoReaction(video: LibraryVideoItem, reaction: VideoReaction) {
    if (savingReactionHash) {
      return;
    }

    const nextReaction = video.reaction === reaction ? null : reaction;
    setSavingReactionHash(video.contentHash);
    setError(null);

    try {
      const savedReaction = await window.localVideoManager.setVideoReaction(
        video.contentHash,
        nextReaction,
      );
      setVideoPage((currentPage) =>
        currentPage
          ? {
              ...currentPage,
              items: currentPage.items.map((item) =>
                item.contentHash === video.contentHash
                  ? { ...item, reaction: savedReaction }
                  : item,
              ),
            }
          : currentPage,
      );

      if (appliedLibraryQuery.reaction !== null) {
        await loadVideoPage(videoPage?.pageIndex ?? 0);
      }
    } catch {
      setError('영상 반응을 저장하지 못했습니다. 다시 시도하세요.');
    } finally {
      setSavingReactionHash(null);
    }
  }

  function openPlayer(video: LibraryVideoItem) {
    if (!video.playbackUrl) {
      return;
    }

    setPlaybackError(false);
    setPlayingVideo(video);
  }

  function closePlayer() {
    const videoElement = videoElementRef.current;
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
    }

    setPlayingVideo(null);
    setPlaybackError(false);
  }

  async function openVideoSourceUrl(video: LibraryVideoItem) {
    if (!video.sourceUrl) {
      return;
    }

    setError(null);
    try {
      await window.localVideoManager.openVideoSourceUrl(video.contentHash);
    } catch {
      setError('원본 URL을 열지 못했습니다. 다시 시도하세요.');
    }
  }

  async function revealVideoFile(video: LibraryVideoItem) {
    if (!video.fileAvailable) {
      return;
    }

    setError(null);
    try {
      await window.localVideoManager.revealVideoFile(video.contentHash);
    } catch {
      setError('영상 파일 위치를 열지 못했습니다. 다시 불러온 후 시도하세요.');
    }
  }

  async function openVideoDetails(video: LibraryVideoItem) {
    setViewingVideo(video);
    setViewingMetadata(null);
    setLoadingVideoDetails(true);
    setVideoDetailsError(null);

    try {
      const detail = await window.localVideoManager.getVideoMetadata(video.contentHash);
      setViewingMetadata(detail.current);
    } catch {
      setVideoDetailsError('영상 정보를 불러오지 못했습니다.');
    } finally {
      setLoadingVideoDetails(false);
    }
  }

  function closeVideoDetails() {
    setViewingVideo(null);
    setViewingMetadata(null);
    setLoadingVideoDetails(false);
    setVideoDetailsError(null);
  }

  async function openMetadataEditor(video: LibraryVideoItem) {
    setEditingVideo(video);
    setVideoMetadata(null);
    setSourceUrl('');
    setSourceCaption('');
    setMetadataError(null);
    setMetadataSaved(false);
    setMetadataSearchOpen(false);
    setMetadataSearchQuery('');
    setMetadataSearchResults([]);
    setMetadataSearchAttempted(false);
    setMetadataSearchError(null);
    setCopiedFromVideo(null);
    setSelectedVideoTagIds(video.tags.map((tag) => tag.id));
    setLoadingMetadata(true);

    try {
      const detail = await window.localVideoManager.getVideoMetadata(video.contentHash);
      setVideoMetadata(detail);
      setSourceUrl(detail.current?.sourceUrl ?? '');
      setSourceCaption(detail.current?.sourceCaption ?? '');
    } catch {
      setMetadataError('등록된 영상 정보를 불러오지 못했습니다.');
    } finally {
      setLoadingMetadata(false);
    }
  }

  function closeMetadataEditor() {
    setEditingVideo(null);
    setVideoMetadata(null);
    setMetadataError(null);
    setMetadataSaved(false);
    setMetadataSearchOpen(false);
    setMetadataSearchResults([]);
    setMetadataSearchError(null);
    setCopiedFromVideo(null);
    setSelectedVideoTagIds([]);
  }

  async function searchMetadataSources() {
    if (!editingVideo || !metadataSearchQuery.trim()) {
      return;
    }

    setSearchingMetadata(true);
    setMetadataSearchError(null);
    setMetadataSearchAttempted(true);

    try {
      setMetadataSearchResults(
        await window.localVideoManager.searchVideoMetadata(
          metadataSearchQuery,
          editingVideo.contentHash,
        ),
      );
    } catch {
      setMetadataSearchError('기존 영상 정보를 검색하지 못했습니다.');
    } finally {
      setSearchingMetadata(false);
    }
  }

  function copyMetadataFrom(result: VideoMetadataSearchResult) {
    setSourceUrl(result.sourceUrl ?? '');
    setSourceCaption(result.sourceCaption ?? '');
    setCopiedFromVideo(result);
    setMetadataSearchOpen(false);
    setMetadataSaved(false);
    setMetadataError(null);
  }

  function toggleVideoTag(tagId: number) {
    setSelectedVideoTagIds((tagIds) =>
      tagIds.includes(tagId)
        ? tagIds.filter((selectedTagId) => selectedTagId !== tagId)
        : [...tagIds, tagId],
    );
    setMetadataSaved(false);
    setMetadataError(null);
  }

  async function saveMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingVideo) {
      return;
    }

    setSavingMetadata(true);
    setMetadataError(null);
    setMetadataSaved(false);

    try {
      const hasMetadataInput = Boolean(sourceUrl.trim() || sourceCaption.trim());
      if (videoMetadata?.current && !hasMetadataInput) {
        setMetadataError('기존 URL과 캡션을 모두 비울 수 없습니다. 한 가지 이상 입력하세요.');
        return;
      }

      const detail = hasMetadataInput
        ? await window.localVideoManager.saveVideoMetadata(
            editingVideo.contentHash,
            {
              sourceCaption,
              sourceUrl,
            },
            copiedFromVideo?.contentHash ?? null,
          )
        : videoMetadata;
      const assignedTags = await window.localVideoManager.setVideoTags(
        editingVideo.contentHash,
        selectedVideoTagIds,
      );
      if (!detail) {
        throw new Error('Video metadata was not loaded.');
      }

      setVideoMetadata(detail);
      setSourceUrl(detail.current?.sourceUrl ?? '');
      setSourceCaption(detail.current?.sourceCaption ?? '');
      setMetadataSaved(true);
      setCopiedFromVideo(null);
      setEditingVideo((currentVideo) =>
        currentVideo
          ? {
              ...currentVideo,
              metadataRegistered: detail.current !== null,
              metadataUpdatedAt: detail.current?.updatedAt ?? null,
              sourceUrl: detail.current?.sourceUrl ?? null,
              tags: assignedTags,
            }
          : currentVideo,
      );
      setVideoPage((currentPage) =>
        currentPage
          ? {
              ...currentPage,
              items: currentPage.items.map((video) =>
                video.contentHash === editingVideo.contentHash
                  ? {
                      ...video,
                      metadataRegistered: detail.current !== null,
                      metadataUpdatedAt: detail.current?.updatedAt ?? null,
                      sourceUrl: detail.current?.sourceUrl ?? null,
                      tags: assignedTags,
                    }
                  : video,
              ),
            }
          : currentPage,
      );
      await Promise.all([refreshTags(), loadVideoPage(videoPage?.pageIndex ?? 0)]);
    } catch {
      setMetadataError('입력한 URL·캡션과 태그를 확인한 뒤 다시 저장하세요.');
    } finally {
      setSavingMetadata(false);
    }
  }

  if (!state) {
    return (
      <main className="app-shell app-shell-loading">
        <section className="launch-state" role={error ? 'alert' : 'status'}>
          <span className="launch-brand-mark">
            <BrandIcon />
          </span>
          {error ? (
            <span className="launch-error-mark">!</span>
          ) : (
            <span className="loading-spinner" />
          )}
          <strong>{error ?? '라이브러리를 준비하고 있습니다'}</strong>
          <p>
            {error
              ? '앱을 다시 실행해 주세요.'
              : '저장된 설정과 영상 정보를 안전하게 불러오는 중입니다.'}
          </p>
        </section>
      </main>
    );
  }

  const libraryVisible = showLibrary && Boolean(state.libraryStats.lastScannedAt);
  const activeFolderName = getFolderName(state.libraryRoot);

  return (
    <main
      className={libraryVisible ? 'app-shell app-shell-library' : 'app-shell app-shell-onboarding'}
    >
      {libraryVisible ? (
        <>
          <header className="library-topbar">
            <div className="library-topbar-inner">
              <div className="app-brand">
                <span className="app-brand-mark">
                  <BrandIcon />
                </span>
                <div className="app-brand-copy">
                  <strong>Local Video Manager</strong>
                  <span title={state.libraryRoot ?? undefined}>{activeFolderName}</span>
                </div>
              </div>

              <div className="library-toolbar">
                <div className="library-total" aria-label="현재 라이브러리 영상 수">
                  <strong>{state.libraryStats.uniqueVideoCount.toLocaleString()}</strong>
                  <span>videos</span>
                </div>
                <button
                  className="toolbar-icon-button"
                  type="button"
                  onClick={() => void scanFolder()}
                  disabled={
                    scanningFolder || choosingFolder || databaseBusy || !state.libraryRootAvailable
                  }
                  aria-label="영상 다시 불러오기"
                  title="영상 다시 불러오기"
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M20 7v5h-5M4 17v-5h5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6.1 8.2A7 7 0 0 1 18.8 7M17.9 15.8A7 7 0 0 1 5.2 17"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <div className="settings-menu-wrap" ref={settingsMenuRef}>
                  <button
                    className={
                      settingsOpen
                        ? 'toolbar-icon-button toolbar-icon-button-active'
                        : 'toolbar-icon-button'
                    }
                    type="button"
                    onClick={() => setSettingsOpen((open) => !open)}
                    disabled={scanningFolder || choosingFolder || databaseBusy}
                    aria-label="설정 메뉴"
                    aria-haspopup="menu"
                    aria-expanded={settingsOpen}
                    title="설정"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M9.7 3.4h4.6l.5 2a7.7 7.7 0 0 1 1.5.9l2-.6 2.3 4-1.5 1.4a8 8 0 0 1 0 1.8l1.5 1.4-2.3 4-2-.6a7.7 7.7 0 0 1-1.5.9l-.5 2H9.7l-.5-2a7.7 7.7 0 0 1-1.5-.9l-2 .6-2.3-4 1.5-1.4a8 8 0 0 1 0-1.8L3.4 9.7l2.3-4 2 .6a7.7 7.7 0 0 1 1.5-.9l.5-2Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </button>

                  {settingsOpen ? (
                    <div className="settings-menu" role="menu" aria-label="라이브러리 설정">
                      <div className="settings-menu-header">
                        <span>현재 라이브러리</span>
                        <strong title={state.libraryRoot ?? undefined}>{activeFolderName}</strong>
                        <small>{formatScanTime(state.libraryStats.lastScannedAt)}</small>
                      </div>
                      <button type="button" role="menuitem" onClick={() => void chooseFolder()}>
                        <span className="settings-item-icon">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M3.5 7.5h6l1.7 2h9.3v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M3.5 8V5.7a2.2 2.2 0 0 1 2.2-2.2h4.2l1.8 2h6.6a2.2 2.2 0 0 1 2.2 2.2v1.8"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span>
                          <strong>영상 폴더 변경</strong>
                          <small>관리할 로컬 폴더 선택</small>
                        </span>
                      </button>
                      <button type="button" role="menuitem" onClick={openTagManager}>
                        <span className="settings-item-icon">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 5.5A1.5 1.5 0 0 1 5.5 4H13l7 7-8.5 8.5L4 12V5.5Z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                          </svg>
                        </span>
                        <span>
                          <strong>태그 관리</strong>
                          <small>태그 생성, 이름 수정 및 삭제</small>
                        </span>
                      </button>
                      <div className="settings-menu-divider" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void createDatabaseBackup()}
                      >
                        <span className="settings-item-icon">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 14.5v4A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-4"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span>
                          <strong>{backingUpDatabase ? '백업 중…' : 'DB 백업'}</strong>
                          <small>영상 정보와 설정 저장</small>
                        </span>
                      </button>
                      <button
                        className="settings-danger-item"
                        type="button"
                        role="menuitem"
                        onClick={() => void restoreDatabaseBackup()}
                      >
                        <span className="settings-item-icon">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M12 21V9M7.5 13.5 12 9l4.5 4.5M4 9.5v-4A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v4"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span>
                          <strong>{restoringDatabase ? '복원 준비 중…' : 'DB 복원'}</strong>
                          <small>저장된 백업 불러오기</small>
                        </span>
                      </button>
                      <div className="settings-menu-footer">
                        Local Video Manager v{state.appVersion}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <div className="library-content">
            {error || databaseMessage || databaseError ? (
              <div
                className={error || databaseError ? 'app-notice app-notice-error' : 'app-notice'}
                role={error || databaseError ? 'alert' : 'status'}
              >
                <span>{error ?? databaseError ?? databaseMessage}</span>
                <button
                  type="button"
                  aria-label="알림 닫기"
                  onClick={() => {
                    setError(null);
                    setDatabaseMessage(null);
                    setDatabaseError(null);
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}

            <section className="library-section" aria-labelledby="video-library-heading">
              <div className="library-section-heading">
                <div className="library-heading-copy">
                  <p className="eyebrow">MY VIDEO LIBRARY</p>
                  <h1 id="video-library-heading">영상 라이브러리</h1>
                  <p>
                    <strong>{activeFolderName}</strong> 폴더에서 관리 중인 영상을 확인하세요.
                  </p>
                </div>
                <span className="library-count">
                  <strong>{videoPage?.totalItems ?? 0}</strong>개 조회 결과
                </span>
              </div>

              <form
                className="library-filters"
                onSubmit={(event) => void applyLibraryFilters(event)}
              >
                <div className="library-filters-heading">
                  <span className="filter-heading-icon">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                      <path
                        d="m15.5 15.5 4.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong>검색 및 필터</strong>
                    <small>파일명, 태그, 반응과 날짜 조건으로 원하는 영상을 찾습니다.</small>
                  </span>
                </div>
                <label className="library-filter-field library-filter-search">
                  <span>제목 검색</span>
                  <input
                    type="search"
                    value={librarySearchQuery}
                    onChange={(event) => {
                      setLibrarySearchQuery(event.target.value);
                      setLibraryFilterError(null);
                    }}
                    placeholder="파일명 일부를 입력하세요"
                    maxLength={VIDEO_LIBRARY_SEARCH_MAX_LENGTH}
                    disabled={loadingVideos}
                  />
                </label>
                <label className="library-filter-field library-filter-tag">
                  <span>태그</span>
                  <select
                    value={libraryTagId ?? ''}
                    onChange={(event) => {
                      setLibraryTagId(event.target.value ? Number(event.target.value) : null);
                      setLibraryFilterError(null);
                    }}
                    disabled={loadingVideos}
                  >
                    <option value="">전체 태그</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name} ({tag.videoCount})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="library-filter-field library-filter-reaction">
                  <span>반응</span>
                  <select
                    value={libraryReaction ?? ''}
                    onChange={(event) => {
                      setLibraryReaction(
                        event.target.value
                          ? (event.target.value as LibraryVideoReactionFilter)
                          : null,
                      );
                      setLibraryFilterError(null);
                    }}
                    disabled={loadingVideos}
                  >
                    <option value="">전체 반응</option>
                    <option value="hype">하이프</option>
                    <option value="unhype">언하이프</option>
                    <option value="none">미지정</option>
                  </select>
                </label>
                <label className="library-filter-field library-filter-sort">
                  <span>정렬</span>
                  <select
                    value={librarySortOption}
                    onChange={(event) => {
                      setLibrarySortOption(event.target.value as LibrarySortOption);
                      setLibraryFilterError(null);
                    }}
                    disabled={loadingVideos}
                  >
                    <option value="registeredAt-desc">DB 등록일 · 내림차순 (최신순)</option>
                    <option value="registeredAt-asc">DB 등록일 · 오름차순 (오래된순)</option>
                    <option value="modifiedAt-desc">파일 수정일 · 내림차순 (최신순)</option>
                    <option value="modifiedAt-asc">파일 수정일 · 오름차순 (오래된순)</option>
                  </select>
                </label>
                <label className="library-filter-field">
                  <span>
                    {librarySortOption.startsWith('registeredAt') ? 'DB 등록일' : '파일 수정일'}{' '}
                    시작
                  </span>
                  <input
                    type="date"
                    value={libraryDateFrom}
                    max={libraryDateTo}
                    onChange={(event) => {
                      setLibraryDateFrom(event.target.value);
                      setLibraryFilterError(null);
                    }}
                    disabled={loadingVideos}
                    required
                  />
                </label>
                <label className="library-filter-field">
                  <span>
                    {librarySortOption.startsWith('registeredAt') ? 'DB 등록일' : '파일 수정일'}{' '}
                    종료
                  </span>
                  <input
                    type="date"
                    value={libraryDateTo}
                    min={libraryDateFrom}
                    onChange={(event) => {
                      setLibraryDateTo(event.target.value);
                      setLibraryFilterError(null);
                    }}
                    disabled={loadingVideos}
                    required
                  />
                </label>
                <button
                  className="primary-button library-filter-submit"
                  type="submit"
                  disabled={loadingVideos}
                >
                  {loadingVideos ? <span className="button-spinner" /> : null}
                  {loadingVideos ? '조회 중…' : '조회'}
                </button>
                {libraryFilterError ? (
                  <p className="library-filter-error" role="alert">
                    {libraryFilterError}
                  </p>
                ) : null}
              </form>

              {loadingVideos && !videoPage ? (
                <p className="library-message">썸네일 생성 중…</p>
              ) : null}

              {!loadingVideos && videoPage?.items.length === 0 ? (
                <p className="library-message">조회 조건에 맞는 영상을 찾지 못했습니다.</p>
              ) : null}

              {videoPage?.items.length ? (
                <div className={loadingVideos ? 'video-grid video-grid-loading' : 'video-grid'}>
                  {videoPage.items.map((video) => (
                    <article className="video-card" key={video.contentHash}>
                      <div className="thumbnail-frame">
                        <button
                          className="thumbnail-button"
                          type="button"
                          onClick={() => openPlayer(video)}
                          disabled={!video.playbackUrl}
                          aria-label={`${video.fileName} 재생`}
                        >
                          {video.thumbnailDataUrl ? (
                            <img
                              src={video.thumbnailDataUrl}
                              alt={`${video.fileName} 썸네일`}
                              loading="lazy"
                            />
                          ) : (
                            <span className="thumbnail-placeholder" aria-label="썸네일 없음">
                              <span>미리보기 없음</span>
                            </span>
                          )}
                          {video.playbackUrl ? (
                            <span className="play-indicator" aria-hidden="true" />
                          ) : null}
                        </button>
                        {video.tags.length ? (
                          <span className="video-thumbnail-tags" aria-label="영상 태그">
                            <span className="video-thumbnail-tag-primary">
                              #{video.tags[0].name}
                            </span>
                            {video.tags.length > 1 ? (
                              <span className="video-thumbnail-tag-more">
                                +{video.tags.length - 1}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        <div className="video-thumbnail-reactions" aria-label="영상 반응">
                          <button
                            className={
                              video.reaction === 'hype'
                                ? 'video-thumbnail-reaction-button active'
                                : 'video-thumbnail-reaction-button'
                            }
                            type="button"
                            onClick={() => void updateVideoReaction(video, 'hype')}
                            disabled={loadingVideos || savingReactionHash !== null}
                            aria-pressed={video.reaction === 'hype'}
                            aria-label="하이프"
                            title="하이프"
                          >
                            <ReactionIcon direction="up" filled={video.reaction === 'hype'} />
                          </button>
                          <span className="video-thumbnail-reaction-divider" aria-hidden="true" />
                          <button
                            className={
                              video.reaction === 'unhype'
                                ? 'video-thumbnail-reaction-button active'
                                : 'video-thumbnail-reaction-button'
                            }
                            type="button"
                            onClick={() => void updateVideoReaction(video, 'unhype')}
                            disabled={loadingVideos || savingReactionHash !== null}
                            aria-pressed={video.reaction === 'unhype'}
                            aria-label="언하이프"
                            title="언하이프"
                          >
                            <ReactionIcon direction="down" filled={video.reaction === 'unhype'} />
                          </button>
                        </div>
                        {!video.fileAvailable ? (
                          <span className="file-status">파일 없음</span>
                        ) : null}
                      </div>
                      <div className="video-card-copy">
                        <button
                          className="video-file-name"
                          type="button"
                          title={`${video.fileName} 정보 보기`}
                          onClick={() => void openVideoDetails(video)}
                        >
                          {video.fileName}
                        </button>
                        {video.sourceUrl ? (
                          <button
                            className="video-source-url"
                            type="button"
                            title={video.sourceUrl}
                            onClick={() => void openVideoSourceUrl(video)}
                          >
                            {video.sourceUrl}
                          </button>
                        ) : (
                          <span className="video-source-url-empty">URL 정보 없음</span>
                        )}
                        <div className="video-meta">
                          <span>{formatFileSize(video.sizeBytes)}</span>
                          <button
                            className="video-location-button"
                            type="button"
                            onClick={() => void revealVideoFile(video)}
                            disabled={!video.fileAvailable}
                            aria-label={`${video.fileName} 파일 위치로 이동`}
                          >
                            위치로 이동
                          </button>
                        </div>
                        <div className="video-dates">
                          <span className="video-date">
                            <span className="video-date-label">DB 등록일</span>
                            <span className="video-date-value">
                              {formatVideoDate(video.registeredAt)}
                            </span>
                          </span>
                          <span className="video-date">
                            <span className="video-date-label">파일 수정일</span>
                            <span className="video-date-value">
                              {formatVideoDate(video.modifiedAtMs)}
                            </span>
                          </span>
                        </div>
                        <button
                          className={
                            video.metadataRegistered || video.tags.length > 0
                              ? 'metadata-button metadata-button-registered'
                              : 'metadata-button'
                          }
                          type="button"
                          onClick={() => void openMetadataEditor(video)}
                        >
                          {video.metadataRegistered || video.tags.length > 0
                            ? '정보·태그 수정'
                            : '정보·태그 등록'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {videoPage && videoPage.totalPages > 1 ? (
                <nav className="pagination" aria-label="영상 목록 페이지">
                  <button
                    className="secondary-button"
                    onClick={() => loadVideoPage(videoPage.pageIndex - 1)}
                    disabled={loadingVideos || videoPage.pageIndex === 0}
                  >
                    이전
                  </button>
                  <span>
                    {videoPage.pageIndex + 1} / {videoPage.totalPages}
                  </span>
                  <button
                    className="secondary-button"
                    onClick={() => loadVideoPage(videoPage.pageIndex + 1)}
                    disabled={loadingVideos || videoPage.pageIndex + 1 >= videoPage.totalPages}
                  >
                    다음
                  </button>
                </nav>
              ) : null}
            </section>
          </div>
        </>
      ) : (
        <section className="onboarding-page" aria-labelledby="onboarding-title">
          <header className="onboarding-header">
            <div className="app-brand app-brand-on-dark">
              <span className="app-brand-mark">
                <BrandIcon />
              </span>
              <div className="app-brand-copy">
                <strong>Local Video Manager</strong>
                <span>나만의 로컬 영상 라이브러리</span>
              </div>
            </div>
            <span className="onboarding-version">v{state.appVersion}</span>
          </header>

          <div className="onboarding-layout">
            <div className="onboarding-intro">
              <p className="eyebrow">ORGANIZE YOUR VIDEO LIBRARY</p>
              <h1 id="onboarding-title">
                흩어진 영상을
                <br />
                한곳에서 관리하세요.
              </h1>
              <p className="onboarding-description">
                폴더 하나만 지정하면 영상을 식별하고 썸네일과 정보를 정리해 나만의 로컬 라이브러리를
                만들어 드립니다.
              </p>
              <div className="onboarding-features" aria-label="주요 특징">
                <div>
                  <span className="feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m9 12 2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong>원본 그대로</strong>
                    <small>영상 파일을 이동하거나 수정하지 않습니다.</small>
                  </span>
                </div>
                <div>
                  <span className="feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M7 3v3M17 3v3M7 18v3M17 18v3M3 7h3M18 7h3M3 17h3M18 17h3"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                      <rect
                        x="6"
                        y="6"
                        width="12"
                        height="12"
                        rx="3"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                      <path d="M10 10h4v4h-4z" fill="currentColor" />
                    </svg>
                  </span>
                  <span>
                    <strong>정확한 영상 식별</strong>
                    <small>SHA-256으로 파일명이 바뀌어도 구분합니다.</small>
                  </span>
                </div>
                <div>
                  <span className="feature-icon">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <ellipse
                        cx="12"
                        cy="6"
                        rx="7"
                        ry="3"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                      <path
                        d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong>내 컴퓨터에 저장</strong>
                    <small>영상 정보는 로컬 SQLite DB로 관리합니다.</small>
                  </span>
                </div>
              </div>
            </div>

            <section className="onboarding-card" aria-labelledby="folder-setup-title">
              <div className="onboarding-steps" aria-label="라이브러리 설정 단계">
                <div
                  className={
                    state.libraryRoot
                      ? 'onboarding-step onboarding-step-complete'
                      : 'onboarding-step onboarding-step-active'
                  }
                >
                  <span>{state.libraryRoot ? '✓' : '1'}</span>
                  <small>폴더 선택</small>
                </div>
                <span
                  className={
                    state.libraryRoot
                      ? 'onboarding-step-line onboarding-step-line-complete'
                      : 'onboarding-step-line'
                  }
                />
                <div
                  className={
                    state.libraryRoot ? 'onboarding-step onboarding-step-active' : 'onboarding-step'
                  }
                >
                  <span>2</span>
                  <small>영상 스캔</small>
                </div>
              </div>

              <div className="onboarding-card-heading">
                <span className="folder-setup-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3.5 7.5h6l1.7 2h9.3v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3.5 8V5.7a2.2 2.2 0 0 1 2.2-2.2h4.2l1.8 2h6.6a2.2 2.2 0 0 1 2.2 2.2v1.8"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <p className="eyebrow">GET STARTED</p>
                  <h2 id="folder-setup-title">
                    {state.libraryRoot ? '이 폴더를 스캔할까요?' : '영상 폴더를 선택하세요'}
                  </h2>
                </div>
              </div>

              {state.libraryRoot ? (
                <div
                  className={
                    state.libraryRootAvailable
                      ? 'selected-folder'
                      : 'selected-folder selected-folder-unavailable'
                  }
                >
                  <span className="selected-folder-status" aria-hidden="true" />
                  <div>
                    <strong>{activeFolderName}</strong>
                    <span title={state.libraryRoot}>{state.libraryRoot}</span>
                  </div>
                  <small>{state.libraryRootAvailable ? '접근 가능' : '폴더를 찾을 수 없음'}</small>
                </div>
              ) : (
                <div className="empty-folder-state">
                  <span>아직 선택된 폴더가 없습니다.</span>
                  <small>영상이 모여 있는 최상위 폴더 하나를 선택해 주세요.</small>
                </div>
              )}

              {error ? (
                <p className="onboarding-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="onboarding-actions">
                {state.libraryRoot ? (
                  <button
                    className="secondary-button onboarding-secondary-button"
                    type="button"
                    onClick={() => void chooseFolder()}
                    disabled={choosingFolder || scanningFolder || databaseBusy}
                  >
                    {choosingFolder ? '선택 중…' : '다른 폴더 선택'}
                  </button>
                ) : null}
                <button
                  className="primary-button onboarding-primary-button"
                  type="button"
                  onClick={() => void (state.libraryRoot ? scanFolder() : chooseFolder())}
                  disabled={
                    choosingFolder ||
                    scanningFolder ||
                    databaseBusy ||
                    Boolean(state.libraryRoot && !state.libraryRootAvailable)
                  }
                >
                  {choosingFolder
                    ? '폴더 여는 중…'
                    : state.libraryRoot
                      ? '영상 스캔 시작'
                      : '영상 폴더 선택하기'}
                  <span aria-hidden="true">→</span>
                </button>
              </div>

              <p className="onboarding-note">
                선택한 폴더에서 최대 3단계까지 탐색합니다. 영상 원본은 변경하지 않습니다.
              </p>
              <div className="onboarding-restore-entry">
                <span>이전에 사용하던 DB 백업이 있나요?</span>
                <button
                  type="button"
                  onClick={() => void restoreDatabaseBackup()}
                  disabled={restoringDatabase || choosingFolder || scanningFolder}
                >
                  {restoringDatabase ? '복원 준비 중…' : '백업에서 복원'}
                </button>
              </div>
            </section>
          </div>
        </section>
      )}

      {scanningFolder ? (
        <div className="scan-backdrop">
          <section
            className="scan-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-progress-title"
          >
            <div className="scan-progress-visual" aria-hidden="true">
              <span />
              <BrandIcon />
            </div>
            <p className="eyebrow">BUILDING LIBRARY</p>
            <h2 id="scan-progress-title">영상 라이브러리를 만들고 있습니다</h2>
            <p className="scan-dialog-description">
              폴더를 탐색하고 각 영상을 식별해 DB에 안전하게 저장하는 중입니다.
            </p>
            <div className="scan-current-folder" title={state.libraryRoot ?? undefined}>
              <span className="loading-dots">
                <i />
                <i />
                <i />
              </span>
              <strong>{activeFolderName}</strong>
            </div>
            <div className="scan-work-list" aria-label="진행 중인 작업">
              <span>폴더 구조 확인</span>
              <span>영상 해시 생성</span>
              <span>DB 정보 저장</span>
            </div>
            <small>영상 수와 파일 크기에 따라 잠시 시간이 걸릴 수 있습니다.</small>
          </section>
        </div>
      ) : null}

      {scanCompletedOpen && scanSummary ? (
        <div className="scan-backdrop">
          <section
            className="scan-dialog scan-complete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-complete-title"
          >
            <span className="scan-complete-icon" aria-hidden="true">
              ✓
            </span>
            <p className="eyebrow">SCAN COMPLETE</p>
            <h2 id="scan-complete-title">
              {showLibrary
                ? '영상 목록을 최신 상태로 업데이트했습니다'
                : '영상 라이브러리가 준비되었습니다'}
            </h2>
            <p className="scan-dialog-description">
              스캔 결과를 확인하고 영상 목록으로 이동하세요.
            </p>
            <div className="scan-summary-grid">
              <div>
                <strong>{scanSummary.fileCount.toLocaleString()}</strong>
                <span>전체 파일</span>
              </div>
              <div>
                <strong>{scanSummary.uniqueVideoCount.toLocaleString()}</strong>
                <span>고유 영상</span>
              </div>
              <div>
                <strong>{scanSummary.addedVideoCount.toLocaleString()}</strong>
                <span>새 영상</span>
              </div>
            </div>
            <p className="scan-summary-detail">
              중복 파일 {scanSummary.duplicateFileCount}개 · 제거된 파일{' '}
              {scanSummary.removedFileCount}개 · 깊이 초과 폴더 {scanSummary.excludedDirectoryCount}
              개
            </p>
            <button
              className="primary-button scan-complete-button"
              type="button"
              onClick={() => {
                setScanCompletedOpen(false);
                setShowLibrary(true);
              }}
              autoFocus
            >
              {showLibrary ? '확인' : '영상 목록 보기'}
            </button>
          </section>
        </div>
      ) : null}

      {tagManagerOpen ? (
        <div
          className="tag-manager-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTagManager();
            }
          }}
        >
          <section
            className="tag-manager-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tag-manager-title"
          >
            <header className="tag-manager-header">
              <div>
                <p className="eyebrow">PERSONALIZE YOUR LIBRARY</p>
                <h2 id="tag-manager-title">태그 관리</h2>
                <p>업무에 맞는 태그를 만들고 이름과 사용 상태를 관리하세요.</p>
              </div>
              <button
                className="metadata-close-button"
                type="button"
                onClick={closeTagManager}
                aria-label="태그 관리 닫기"
                disabled={tagManagerBusy}
              >
                ×
              </button>
            </header>

            <div className="tag-manager-body">
              <form className="tag-create-form" onSubmit={(event) => void createTag(event)}>
                <label htmlFor="new-tag-name">새 태그</label>
                <div>
                  <input
                    id="new-tag-name"
                    value={newTagName}
                    onChange={(event) => {
                      setNewTagName(event.target.value);
                      setTagManagerError(null);
                      setTagManagerMessage(null);
                    }}
                    placeholder="예: 유머, 일본어, 인기 영상"
                    maxLength={VIDEO_TAG_NAME_MAX_LENGTH}
                    disabled={tagManagerBusy}
                    autoFocus
                  />
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={tagManagerBusy || !newTagName.trim()}
                  >
                    {tagManagerBusy ? '처리 중…' : '태그 만들기'}
                  </button>
                </div>
                <small>공백을 제외한 {VIDEO_TAG_NAME_MAX_LENGTH}자까지 입력할 수 있습니다.</small>
              </form>

              {tagManagerError ? (
                <p className="tag-manager-notice tag-manager-notice-error" role="alert">
                  {tagManagerError}
                </p>
              ) : null}
              {tagManagerMessage ? (
                <p className="tag-manager-notice" role="status">
                  {tagManagerMessage}
                </p>
              ) : null}

              <div className="tag-list-heading">
                <div>
                  <strong>등록된 태그</strong>
                  <span>영상 수는 해당 태그가 지정된 전체 영상 기준입니다.</span>
                </div>
                <span>{tags.length}개</span>
              </div>

              {tags.length ? (
                <ul className="tag-manager-list">
                  {tags.map((tag) => (
                    <li key={tag.id}>
                      {editingTagId === tag.id ? (
                        <form
                          className="tag-rename-form"
                          onSubmit={(event) => void renameTag(event)}
                        >
                          <input
                            value={editingTagName}
                            onChange={(event) => {
                              setEditingTagName(event.target.value);
                              setTagManagerError(null);
                            }}
                            maxLength={VIDEO_TAG_NAME_MAX_LENGTH}
                            disabled={tagManagerBusy}
                            aria-label={`${tag.name} 태그 새 이름`}
                            autoFocus
                          />
                          <button
                            className="tag-row-save"
                            type="submit"
                            disabled={tagManagerBusy || !editingTagName.trim()}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTagId(null);
                              setEditingTagName('');
                              setTagManagerError(null);
                            }}
                            disabled={tagManagerBusy}
                          >
                            취소
                          </button>
                        </form>
                      ) : (
                        <div className="tag-manager-row">
                          <div className="tag-manager-name">
                            <span aria-hidden="true">#</span>
                            <strong>{tag.name}</strong>
                            <small>{tag.videoCount.toLocaleString()}개 영상</small>
                          </div>
                          <div className="tag-manager-actions">
                            <button
                              type="button"
                              onClick={() => beginRenamingTag(tag)}
                              disabled={tagManagerBusy}
                            >
                              이름 수정
                            </button>
                            <button
                              className="tag-delete-button"
                              type="button"
                              onClick={() => {
                                setPendingDeleteTagId(tag.id);
                                setEditingTagId(null);
                                setTagManagerError(null);
                                setTagManagerMessage(null);
                              }}
                              disabled={tagManagerBusy}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      )}

                      {pendingDeleteTagId === tag.id ? (
                        <div className="tag-delete-confirm" role="alert">
                          <span>‘{tag.name}’ 태그만 삭제하며 영상과 등록 정보는 유지됩니다.</span>
                          <div>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteTagId(null)}
                              disabled={tagManagerBusy}
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteTag(tag)}
                              disabled={tagManagerBusy}
                            >
                              태그 삭제
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="tag-manager-empty">
                  <strong>아직 만든 태그가 없습니다.</strong>
                  <span>위 입력창에서 첫 태그를 만들어 보세요.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {playingVideo?.playbackUrl ? (
        <div
          className="player-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePlayer();
            }
          }}
        >
          <section
            className="player-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-title"
          >
            <header className="player-header">
              <div>
                <p className="eyebrow">VIDEO PREVIEW</p>
                <h2 id="player-title" title={playingVideo.fileName}>
                  {playingVideo.fileName}
                </h2>
              </div>
              <button
                className="player-close-button"
                type="button"
                onClick={closePlayer}
                aria-label="영상 닫기"
                autoFocus
              >
                ×
              </button>
            </header>
            <div className="player-stage">
              <video
                ref={videoElementRef}
                src={playingVideo.playbackUrl}
                poster={playingVideo.thumbnailDataUrl ?? undefined}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={() => setPlaybackError(true)}
              />
              {playbackError ? (
                <p className="player-error" role="alert">
                  이 영상은 현재 재생할 수 없습니다. 파일 형식이나 코덱을 확인하세요.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {viewingVideo ? (
        <div
          className="metadata-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeVideoDetails();
            }
          }}
        >
          <section
            className="metadata-modal video-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-details-title"
          >
            <header className="metadata-header">
              <div>
                <p className="eyebrow">VIDEO INFORMATION</p>
                <h2 id="video-details-title">영상 정보</h2>
                <p title={viewingVideo.fileName}>{viewingVideo.fileName}</p>
              </div>
              <button
                className="metadata-close-button"
                type="button"
                onClick={closeVideoDetails}
                aria-label="영상 정보 닫기"
                autoFocus
              >
                ×
              </button>
            </header>

            <div className="video-details-body">
              <section className="video-details-section" aria-labelledby="video-details-tags">
                <h3 id="video-details-tags">태그</h3>
                {viewingVideo.tags.length ? (
                  <div className="video-details-tags">
                    {viewingVideo.tags.map((tag) => (
                      <span key={tag.id}>#{tag.name}</span>
                    ))}
                  </div>
                ) : (
                  <p className="video-details-empty">지정된 태그가 없습니다.</p>
                )}
              </section>

              {loadingVideoDetails ? (
                <p className="metadata-status">영상 정보를 불러오는 중…</p>
              ) : null}
              {videoDetailsError ? (
                <p className="metadata-error" role="alert">
                  {videoDetailsError}
                </p>
              ) : null}

              {!loadingVideoDetails && !videoDetailsError ? (
                <>
                  <section className="video-details-section" aria-labelledby="video-details-url">
                    <h3 id="video-details-url">원본 URL</h3>
                    {viewingMetadata?.sourceUrl ? (
                      <p className="video-details-url">{viewingMetadata.sourceUrl}</p>
                    ) : (
                      <p className="video-details-empty">등록된 원본 URL이 없습니다.</p>
                    )}
                  </section>
                  <section
                    className="video-details-section"
                    aria-labelledby="video-details-caption"
                  >
                    <h3 id="video-details-caption">원본 캡션</h3>
                    {viewingMetadata?.sourceCaption ? (
                      <p className="video-details-caption">{viewingMetadata.sourceCaption}</p>
                    ) : (
                      <p className="video-details-empty">등록된 원본 캡션이 없습니다.</p>
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {editingVideo ? (
        <div
          className="metadata-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMetadataEditor();
            }
          }}
        >
          <section
            className="metadata-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="metadata-title"
          >
            <header className="metadata-header">
              <div>
                <p className="eyebrow">SOURCE INFORMATION</p>
                <h2 id="metadata-title" title={editingVideo.fileName}>
                  {editingVideo.metadataRegistered || editingVideo.tags.length > 0
                    ? '영상 정보 및 태그 수정'
                    : '영상 정보 및 태그 등록'}
                </h2>
                <p title={editingVideo.fileName}>{editingVideo.fileName}</p>
              </div>
              <button
                className="metadata-close-button"
                type="button"
                onClick={closeMetadataEditor}
                aria-label="영상 정보 닫기"
              >
                ×
              </button>
            </header>

            <form className="metadata-form" onSubmit={(event) => void saveMetadata(event)}>
              <div className="metadata-import-heading">
                <div>
                  <strong>기존 영상 정보 가져오기</strong>
                  <span>파일이 삭제되어 목록에 없는 영상도 검색할 수 있습니다.</span>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setMetadataSearchOpen((open) => !open);
                    setMetadataSearchError(null);
                  }}
                  disabled={loadingMetadata || savingMetadata}
                  aria-expanded={metadataSearchOpen}
                >
                  {metadataSearchOpen ? '검색 닫기' : '영상 검색'}
                </button>
              </div>

              {metadataSearchOpen ? (
                <section className="metadata-search" aria-label="기존 영상 정보 검색">
                  <div className="metadata-search-controls">
                    <input
                      type="search"
                      value={metadataSearchQuery}
                      onChange={(event) => {
                        setMetadataSearchQuery(event.target.value);
                        setMetadataSearchAttempted(false);
                        setMetadataSearchError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void searchMetadataSources();
                        }
                      }}
                      placeholder="파일명, 캡션, URL 또는 SHA-256 검색"
                      maxLength={VIDEO_METADATA_SEARCH_MAX_LENGTH}
                      disabled={searchingMetadata}
                      aria-label="기존 영상 검색어"
                      autoFocus
                    />
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void searchMetadataSources()}
                      disabled={searchingMetadata || !metadataSearchQuery.trim()}
                    >
                      {searchingMetadata ? '검색 중…' : '검색'}
                    </button>
                  </div>

                  {metadataSearchError ? (
                    <p className="metadata-error" role="alert">
                      {metadataSearchError}
                    </p>
                  ) : null}

                  {metadataSearchResults.length ? (
                    <ul className="metadata-search-results">
                      {metadataSearchResults.map((result) => (
                        <li key={result.contentHash}>
                          <button type="button" onClick={() => copyMetadataFrom(result)}>
                            <span className="metadata-search-thumbnail">
                              {result.thumbnailDataUrl ? (
                                <img src={result.thumbnailDataUrl} alt="" />
                              ) : (
                                <span>미리보기 없음</span>
                              )}
                            </span>
                            <span className="metadata-search-copy">
                              <strong title={result.fileName}>{result.fileName}</strong>
                              <span>
                                DB 등록일 {formatVideoDate(result.registeredAt)} ·{' '}
                                {result.filePresent ? '파일 있음' : '파일 없음'}
                              </span>
                              {result.sourceCaption ? (
                                <span className="metadata-search-caption">
                                  {result.sourceCaption}
                                </span>
                              ) : result.sourceUrl ? (
                                <span className="metadata-search-caption">{result.sourceUrl}</span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : metadataSearchAttempted && !searchingMetadata && !metadataSearchError ? (
                    <p className="metadata-search-empty">일치하는 등록 영상을 찾지 못했습니다.</p>
                  ) : null}
                </section>
              ) : null}

              {copiedFromVideo ? (
                <p className="metadata-imported" role="status">
                  <strong>{copiedFromVideo.fileName}</strong>의 정보를 가져왔습니다. 저장해야
                  반영됩니다.
                </p>
              ) : null}

              <section className="video-tag-editor" aria-labelledby="video-tag-editor-title">
                <div className="video-tag-editor-heading">
                  <div>
                    <strong id="video-tag-editor-title">영상 태그</strong>
                    <span>하나의 영상에 여러 태그를 지정할 수 있습니다.</span>
                  </div>
                  <small>{selectedVideoTagIds.length}개 선택</small>
                </div>
                {tags.length ? (
                  <div className="video-tag-options">
                    {tags.map((tag) => {
                      const selected = selectedVideoTagIds.includes(tag.id);
                      return (
                        <button
                          className={selected ? 'video-tag-option selected' : 'video-tag-option'}
                          type="button"
                          key={tag.id}
                          onClick={() => toggleVideoTag(tag.id)}
                          disabled={loadingMetadata || savingMetadata}
                          aria-pressed={selected}
                        >
                          <span aria-hidden="true">#</span>
                          {tag.name}
                          {selected ? <i aria-hidden="true">✓</i> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="video-tag-empty">
                    설정 메뉴의 <strong>태그 관리</strong>에서 태그를 먼저 만들어 주세요.
                  </p>
                )}
              </section>

              <label>
                <span>원본 URL</span>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => {
                    setSourceUrl(event.target.value);
                    setMetadataSaved(false);
                  }}
                  placeholder="https://www.instagram.com/reel/..."
                  maxLength={VIDEO_SOURCE_URL_MAX_LENGTH}
                  disabled={loadingMetadata || savingMetadata}
                />
              </label>
              <label>
                <span>원본 캡션</span>
                <textarea
                  value={sourceCaption}
                  onChange={(event) => {
                    setSourceCaption(event.target.value);
                    setMetadataSaved(false);
                  }}
                  placeholder="다운로드할 때 확인한 원본 캡션을 입력하세요."
                  maxLength={VIDEO_SOURCE_CAPTION_MAX_LENGTH}
                  rows={7}
                  disabled={loadingMetadata || savingMetadata}
                />
                <small>
                  {sourceCaption.length.toLocaleString('ko-KR')} /{' '}
                  {VIDEO_SOURCE_CAPTION_MAX_LENGTH.toLocaleString('ko-KR')}자
                </small>
              </label>

              {loadingMetadata ? <p className="metadata-status">정보를 불러오는 중…</p> : null}
              {metadataError ? (
                <p className="metadata-error" role="alert">
                  {metadataError}
                </p>
              ) : null}
              {metadataSaved ? (
                <p className="metadata-success" role="status">
                  저장했습니다.
                </p>
              ) : null}

              <div className="metadata-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeMetadataEditor}
                  disabled={savingMetadata}
                >
                  닫기
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={loadingMetadata || savingMetadata}
                >
                  {savingMetadata ? '저장 중…' : '정보 및 태그 저장'}
                </button>
              </div>
            </form>

            <section className="metadata-history" aria-labelledby="metadata-history-title">
              <div className="metadata-history-heading">
                <h3 id="metadata-history-title">변경 이력</h3>
                <span>{videoMetadata?.revisions.length ?? 0}개</span>
              </div>
              {videoMetadata?.revisions.length ? (
                <ol>
                  {videoMetadata.revisions.map((revision) => (
                    <li key={revision.id}>
                      <time dateTime={revision.createdAt}>
                        {new Date(revision.createdAt).toLocaleString('ko-KR')}
                      </time>
                      {revision.copiedFromContentHash ? (
                        <p className="metadata-history-source">
                          복사 출처 SHA-256 {revision.copiedFromContentHash.slice(0, 10)}…
                        </p>
                      ) : null}
                      {revision.sourceUrl ? (
                        <p className="metadata-history-url" title={revision.sourceUrl}>
                          {revision.sourceUrl}
                        </p>
                      ) : null}
                      {revision.sourceCaption ? (
                        <p className="metadata-history-caption">{revision.sourceCaption}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="metadata-history-empty">아직 저장 이력이 없습니다.</p>
              )}
            </section>
          </section>
        </div>
      ) : null}
    </main>
  );
}
