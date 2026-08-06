import { useEffect, useRef, useState } from 'react';

import type {
  BootstrapState,
  LibraryVideoItem,
  LibraryVideoPage,
  VideoScanSummary,
} from '../shared/contracts';

function formatScanTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('ko-KR') : '아직 불러오지 않았습니다.';
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function App() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [scanSummary, setScanSummary] = useState<VideoScanSummary | null>(null);
  const [videoPage, setVideoPage] = useState<LibraryVideoPage | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<LibraryVideoItem | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void window.localVideoManager
      .getBootstrapState()
      .then((bootstrapState) => {
        setState(bootstrapState);
        if (bootstrapState.libraryStats.uniqueVideoCount > 0) {
          void loadVideoPage(0);
        }
      })
      .catch(() => setError('앱 초기 정보를 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!playingVideo) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePlayer();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [playingVideo]);

  async function loadVideoPage(pageIndex: number) {
    setLoadingVideos(true);
    setError(null);

    try {
      setVideoPage(await window.localVideoManager.getLibraryVideoPage(pageIndex));
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
          disabled={choosingFolder || scanningFolder}
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

      <section className="next-section">
        <div className="next-section-row">
          <div className="next-section-heading">
            <span className="status-dot" />
            <strong>선택 폴더 영상 불러오기</strong>
          </div>
          <button
            className="primary-button"
            onClick={scanFolder}
            disabled={!state?.libraryRootAvailable || scanningFolder || choosingFolder}
          >
            {scanningFolder ? '불러오는 중…' : '영상 불러오기'}
          </button>
        </div>
        <p>
          하위 폴더까지 탐색해 영상 파일을 SHA-256으로 식별합니다. 마지막 불러오기:{' '}
          {formatScanTime(state?.libraryStats.lastScannedAt ?? null)}
        </p>
        {scanSummary ? (
          <p className="scan-result" role="status">
            총 {scanSummary.fileCount}개 파일 · 고유 영상 {scanSummary.uniqueVideoCount}개 · 새 영상{' '}
            {scanSummary.addedVideoCount}개 · 중복 파일 {scanSummary.duplicateFileCount}개 · 제거된
            파일 {scanSummary.removedFileCount}개 · 해시 재사용 {scanSummary.reusedHashCount}개
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
            <span className="library-count">
              {videoPage?.totalItems ?? state.libraryStats.uniqueVideoCount}개 고유 영상
            </span>
          </div>

          {loadingVideos && !videoPage ? <p className="library-message">썸네일 생성 중…</p> : null}

          {!loadingVideos && videoPage?.items.length === 0 ? (
            <p className="library-message">선택한 폴더에서 지원하는 영상 파일을 찾지 못했습니다.</p>
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
    </main>
  );
}
