import { useEffect, useState } from 'react';

import type { BootstrapState } from '../shared/contracts';

export function App() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);

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
    } catch {
      setError('영상 폴더를 저장하지 못했습니다.');
    } finally {
      setChoosingFolder(false);
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
        <button className="primary-button" onClick={chooseFolder} disabled={choosingFolder}>
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
        <div>
          <span className="status-dot" />
          <strong>기본 셋팅 완료 후 다음 구현</strong>
        </div>
        <p>선택 폴더 스캔 → SHA-256 식별 → 썸네일 그리드 순서로 연결됩니다.</p>
      </section>
    </main>
  );
}
