import { useEffect, useRef, useState } from 'react';

import type {
  BootstrapState,
  LibraryVideoItem,
  LibraryVideoPage,
  LibraryVideoQuery,
  LibraryVideoSortDirection,
  LibraryVideoSortField,
  VideoMetadataDetail,
  VideoMetadataSearchResult,
  VideoScanSummary,
} from '../shared/contracts';
import {
  VIDEO_LIBRARY_SEARCH_MAX_LENGTH,
  VIDEO_METADATA_SEARCH_MAX_LENGTH,
  VIDEO_SOURCE_CAPTION_MAX_LENGTH,
  VIDEO_SOURCE_URL_MAX_LENGTH,
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
  return { dateFromMs, dateToMs, searchQuery, sortDirection, sortField };
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
  const [videoPage, setVideoPage] = useState<LibraryVideoPage | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [defaultLibraryFilters] = useState(createDefaultLibraryFilters);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [librarySortOption, setLibrarySortOption] = useState(defaultLibraryFilters.sortOption);
  const [libraryDateFrom, setLibraryDateFrom] = useState(defaultLibraryFilters.dateFrom);
  const [libraryDateTo, setLibraryDateTo] = useState(defaultLibraryFilters.dateTo);
  const [libraryFilterError, setLibraryFilterError] = useState<string | null>(null);
  const [appliedLibraryQuery, setAppliedLibraryQuery] = useState<LibraryVideoQuery>(() => {
    const query = buildLibraryVideoQuery(
      '',
      defaultLibraryFilters.sortOption,
      defaultLibraryFilters.dateFrom,
      defaultLibraryFilters.dateTo,
    );
    if (!query) {
      throw new Error('Failed to create the default video library query.');
    }
    return query;
  });
  const [playingVideo, setPlayingVideo] = useState<LibraryVideoItem | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
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
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const databaseBusy = backingUpDatabase || restoringDatabase;

  useEffect(() => {
    void window.localVideoManager
      .getBootstrapState()
      .then((bootstrapState) => {
        setState(bootstrapState);
        if (bootstrapState.libraryStats.lastScannedAt) {
          void loadVideoPage(0, appliedLibraryQuery);
        }
      })
      .catch(() => setError('앱 초기 정보를 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!playingVideo && !editingVideo) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (playingVideo) {
          closePlayer();
        } else if (metadataSearchOpen) {
          setMetadataSearchOpen(false);
        } else {
          closeMetadataEditor();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingVideo, metadataSearchOpen, playingVideo]);

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

  async function chooseFolder() {
    setChoosingFolder(true);
    setError(null);

    try {
      const result = await window.localVideoManager.chooseLibraryRoot();
      const folderChanged = result.state.libraryRoot !== state?.libraryRoot;
      setState(result.state);
      if (!result.cancelled) {
        setScanSummary(null);
        if (folderChanged) {
          setVideoPage(null);
          if (result.state.libraryStats.lastScannedAt) {
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
    setScanningFolder(true);
    setError(null);

    try {
      const result = await window.localVideoManager.scanLibrary();
      setState(result.state);
      setScanSummary(result.summary);
      await loadVideoPage(0);
    } catch {
      setError('영상 폴더를 불러오지 못했습니다. 폴더 접근 권한과 파일 상태를 확인하세요.');
    } finally {
      setScanningFolder(false);
    }
  }

  async function createDatabaseBackup() {
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

  async function applyLibraryFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = buildLibraryVideoQuery(
      librarySearchQuery,
      librarySortOption,
      libraryDateFrom,
      libraryDateTo,
    );
    if (!query) {
      setLibraryFilterError('시작일은 종료일보다 늦을 수 없습니다. 날짜 범위를 확인하세요.');
      return;
    }

    setLibraryFilterError(null);
    setAppliedLibraryQuery(query);
    await loadVideoPage(0, query);
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

  async function saveMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingVideo) {
      return;
    }

    setSavingMetadata(true);
    setMetadataError(null);
    setMetadataSaved(false);

    try {
      const detail = await window.localVideoManager.saveVideoMetadata(
        editingVideo.contentHash,
        {
          sourceCaption,
          sourceUrl,
        },
        copiedFromVideo?.contentHash ?? null,
      );
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
                    }
                  : video,
              ),
            }
          : currentPage,
      );
    } catch {
      setMetadataError('URL 또는 캡션을 확인한 뒤 다시 저장하세요.');
    } finally {
      setSavingMetadata(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">LOCAL VIDEO MANAGER</p>
          <h1>내 영상 라이브러리</h1>
          <p className="subtitle">각 멤버의 로컬 폴더를 안전하게 정리하는 데스크톱 앱</p>
        </div>
        <span className="version">v{state?.appVersion ?? '0.1.0'}</span>
      </header>

      <section className="setup-card" aria-labelledby="library-heading">
        <div className="setup-copy">
          <span className="step-badge">첫 단계</span>
          <h2 id="library-heading">관리할 영상 폴더를 선택하세요</h2>
          <p>영상 원본은 이 컴퓨터에 그대로 유지됩니다. 앱은 선택한 폴더의 파일만 읽습니다.</p>
        </div>
        <button
          className="primary-button"
          onClick={chooseFolder}
          disabled={choosingFolder || scanningFolder || databaseBusy}
        >
          {choosingFolder ? '선택 중…' : state?.libraryRoot ? '폴더 변경' : '영상 폴더 선택'}
        </button>
      </section>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="status-grid" aria-label="라이브러리 상태">
        <article className="status-card status-card-wide">
          <span className="status-label">선택된 폴더</span>
          <strong className="path-value">
            {state?.libraryRoot ?? '아직 선택되지 않았습니다.'}
          </strong>
          <span className={state?.libraryRootAvailable ? 'status-ok' : 'status-muted'}>
            {state?.libraryRootAvailable ? '폴더 접근 가능' : '폴더 선택 필요'}
          </span>
          <span className="status-muted">
            {state
              ? `${state.libraryStats.fileCount}개 파일 · ${state.libraryStats.uniqueVideoCount}개 고유 영상`
              : '영상 수 확인 중…'}
          </span>
        </article>
        <article className="status-card">
          <span className="status-label">라이브러리 ID</span>
          <strong className="id-value">{state?.libraryId ?? '생성 중…'}</strong>
          <span className="status-muted">이 설치 환경의 논리 식별자</span>
        </article>
        <article className="status-card">
          <span className="status-label">실행 환경</span>
          <strong>{state?.platform ?? '확인 중…'}</strong>
          <span className="status-muted">Mac 개발 · Windows 배포</span>
        </article>
      </section>

      <section className="database-tools" aria-labelledby="database-tools-heading">
        <div className="database-tools-copy">
          <strong id="database-tools-heading">DB 백업 및 복원</strong>
          <p>
            폴더 설정, 영상 식별 정보, URL, 캡션과 변경 이력을 백업합니다. 영상 원본 파일은 포함되지
            않습니다.
          </p>
        </div>
        <div className="database-tools-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void createDatabaseBackup()}
            disabled={databaseBusy || choosingFolder || scanningFolder}
          >
            {backingUpDatabase ? '백업 중…' : 'DB 백업'}
          </button>
          <button
            className="secondary-button database-restore-button"
            type="button"
            onClick={() => void restoreDatabaseBackup()}
            disabled={databaseBusy || choosingFolder || scanningFolder}
          >
            {restoringDatabase ? '복원 준비 중…' : 'DB 복원'}
          </button>
        </div>
        {databaseMessage ? (
          <p className="database-tools-message" role="status">
            {databaseMessage}
          </p>
        ) : null}
        {databaseError ? (
          <p className="database-tools-error" role="alert">
            {databaseError}
          </p>
        ) : null}
      </section>

      <section className="next-section">
        <div className="next-section-row">
          <div className="next-section-heading">
            <span className="status-dot" />
            <strong>선택 폴더 영상 불러오기</strong>
          </div>
          <button
            className="primary-button"
            onClick={scanFolder}
            disabled={
              !state?.libraryRootAvailable || scanningFolder || choosingFolder || databaseBusy
            }
          >
            {scanningFolder ? '불러오는 중…' : '영상 불러오기'}
          </button>
        </div>
        <p>
          선택 폴더를 포함해 최대 3단계까지 탐색하고 영상 파일을 SHA-256으로 식별합니다. 마지막
          불러오기: {formatScanTime(state?.libraryStats.lastScannedAt ?? null)}
        </p>
        {scanSummary ? (
          <p className="scan-result" role="status">
            총 {scanSummary.fileCount}개 파일 · 고유 영상 {scanSummary.uniqueVideoCount}개 · 새 영상{' '}
            {scanSummary.addedVideoCount}개 · 중복 파일 {scanSummary.duplicateFileCount}개 · 제거된
            파일 {scanSummary.removedFileCount}개 · 깊이 초과 폴더{' '}
            {scanSummary.excludedDirectoryCount}개 · 해시 재사용 {scanSummary.reusedHashCount}개
          </p>
        ) : null}
      </section>

      {state?.libraryStats.lastScannedAt ? (
        <section className="library-section" aria-labelledby="video-library-heading">
          <div className="library-section-heading">
            <div>
              <p className="eyebrow">VIDEO LIBRARY</p>
              <h2 id="video-library-heading">영상 목록</h2>
            </div>
            <span className="library-count">{videoPage?.totalItems ?? 0}개 조회 결과</span>
          </div>

          <form className="library-filters" onSubmit={(event) => void applyLibraryFilters(event)}>
            <label className="library-filter-field">
              <span>정렬</span>
              <select
                value={librarySortOption}
                onChange={(event) => {
                  setLibrarySortOption(event.target.value as LibrarySortOption);
                  setLibraryFilterError(null);
                }}
                disabled={loadingVideos}
              >
                <option value="registeredAt-desc">등록일 · 내림차순 (최신순)</option>
                <option value="registeredAt-asc">등록일 · 오름차순 (오래된순)</option>
                <option value="modifiedAt-desc">수정일 · 내림차순 (최신순)</option>
                <option value="modifiedAt-asc">수정일 · 오름차순 (오래된순)</option>
              </select>
            </label>
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
            <label className="library-filter-field">
              <span>{librarySortOption.startsWith('registeredAt') ? '등록일' : '수정일'} 시작</span>
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
              <span>{librarySortOption.startsWith('registeredAt') ? '등록일' : '수정일'} 종료</span>
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
              {loadingVideos ? '조회 중…' : '조회'}
            </button>
            {libraryFilterError ? (
              <p className="library-filter-error" role="alert">
                {libraryFilterError}
              </p>
            ) : null}
          </form>

          {loadingVideos && !videoPage ? <p className="library-message">썸네일 생성 중…</p> : null}

          {!loadingVideos && videoPage?.items.length === 0 ? (
            <p className="library-message">조회 조건에 맞는 영상을 찾지 못했습니다.</p>
          ) : null}

          {videoPage?.items.length ? (
            <div className={loadingVideos ? 'video-grid video-grid-loading' : 'video-grid'}>
              {videoPage.items.map((video) => (
                <article className="video-card" key={video.contentHash}>
                  <button
                    className="thumbnail-frame thumbnail-button"
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
                      <div className="thumbnail-placeholder" aria-label="썸네일 없음">
                        <span>미리보기 없음</span>
                      </div>
                    )}
                    {video.playbackUrl ? (
                      <span className="play-indicator" aria-hidden="true" />
                    ) : null}
                    <span className={video.fileAvailable ? 'file-status available' : 'file-status'}>
                      {video.fileAvailable ? '파일 확인됨' : '파일 없음'}
                    </span>
                  </button>
                  <div className="video-card-copy">
                    <strong className="video-file-name" title={video.fileName}>
                      {video.fileName}
                    </strong>
                    <span className="video-relative-path" title={video.relativePath}>
                      {video.relativePath}
                    </span>
                    <div className="video-meta">
                      <span>{formatFileSize(video.sizeBytes)}</span>
                      <span title={video.contentHash}>
                        SHA-256 {video.contentHash.slice(0, 10)}…
                      </span>
                    </div>
                    <div className="video-dates">
                      <span>등록 {formatVideoDate(video.registeredAt)}</span>
                      <span>수정 {formatVideoDate(video.modifiedAtMs)}</span>
                    </div>
                    <button
                      className={
                        video.metadataRegistered
                          ? 'metadata-button metadata-button-registered'
                          : 'metadata-button'
                      }
                      type="button"
                      onClick={() => void openMetadataEditor(video)}
                    >
                      {video.metadataRegistered ? '정보 수정' : '정보 등록'}
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
                  {editingVideo.metadataRegistered ? '영상 정보 수정' : '영상 정보 등록'}
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
                                DB 등록 {formatVideoDate(result.registeredAt)} ·{' '}
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
                  disabled={
                    loadingMetadata ||
                    savingMetadata ||
                    (!sourceUrl.trim() && !sourceCaption.trim())
                  }
                >
                  {savingMetadata ? '저장 중…' : '정보 저장'}
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
