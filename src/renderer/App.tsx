import { useEffect, useState } from 'react';

import type { BootstrapState, VideoScanSummary } from '../shared/contracts';

function formatScanTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('ko-KR') : '아직 불러오지 않았습니다.';
}

export function App() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [scanSummary, setScanSummary] = useState<VideoScanSummary | null>(null);

  useEffect(() => {
    void window.localVideoManager
      .getBootstrapState()
      .then(setState)
      .catch(() => setError('앱 초기 정보를 불러오지 못했습니다.'));
  }, []);

  async function chooseFolder() {
    setChoosingFolder(true);
    setError(null);

    try {
      const result = await window.localVideoManager.chooseLibraryRoot();
      setState(result.state);
      if (!result.cancelled) {
        setScanSummary(null);
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
    } catch {
      setError('영상 폴더를 불러오지 못했습니다. 폴더 접근 권한과 파일 상태를 확인하세요.');
    } finally {
      setScanningFolder(false);
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
    </main>
  );
}
