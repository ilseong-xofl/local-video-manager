import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  type AppAuthState,
  type CaptionDailyUsage,
} from '../shared/contracts';
import { companyEmailFromId } from '../shared/company-account';
import { App } from './App';

const ACCESS_RECHECK_INTERVAL_MS = 5 * 60 * 1_000;

function AuthBrand() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="m11 9.5 4 2.5-4 2.5v-5Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function AuthenticationGate() {
  const [authState, setAuthState] = useState<AppAuthState | null>(null);
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const refreshAuthState = useCallback(async () => {
    try {
      setAuthState(await window.localVideoManager.getAuthState());
    } catch {
      setAuthState({
        message: '서비스 연결 상태를 확인하지 못했습니다.',
        reason: 'service',
        status: 'blocked',
      });
    }
  }, []);

  useEffect(() => {
    void refreshAuthState();
    const removeListener = window.localVideoManager.onAuthStateChanged(setAuthState);
    const interval = window.setInterval(() => void refreshAuthState(), ACCESS_RECHECK_INTERVAL_MS);
    const handleNetworkChange = () => void refreshAuthState();
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    return () => {
      removeListener();
      window.clearInterval(interval);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, [refreshAuthState]);

  useEffect(() => {
    if (authState?.status !== 'authenticated') {
      return;
    }

    const resetAt = Date.parse(authState.dailyUsage.resetAt);
    if (!Number.isFinite(resetAt)) {
      return;
    }
    const timeout = window.setTimeout(
      () => void refreshAuthState(),
      Math.max(5_000, resetAt - Date.now() + 1_000),
    );
    return () => window.clearTimeout(timeout);
  }, [authState, refreshAuthState]);

  const updateCaptionDailyUsage = useCallback((dailyUsage: CaptionDailyUsage) => {
    setAuthState((current) =>
      current?.status === 'authenticated' ? { ...current, dailyUsage } : current,
    );
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const email = companyEmailFromId(accountId);
    if (!email) {
      setLoginError('아이디는 @ 없이 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    setLoginError(null);
    try {
      const state = await window.localVideoManager.signIn(email, password);
      setPassword('');
      setAuthState(state);
    } catch {
      const state = await window.localVideoManager.getAuthState().catch(() => null);
      if (state?.status === 'blocked') {
        setAuthState(state);
      } else {
        setLoginError('아이디 또는 비밀번호를 확인해 주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setAuthState(null);
    try {
      setAuthState(await window.localVideoManager.signOut());
    } catch {
      await refreshAuthState();
    }
  }

  async function changePassword(newPassword: string) {
    const state = await window.localVideoManager.changePassword(newPassword);
    setAuthState(state);
  }

  if (!authState) {
    return (
      <main className="auth-shell">
        <section className="auth-state-card" role="status">
          <AuthBrand />
          <span className="auth-spinner" />
          <strong>사용 권한을 확인하고 있습니다</strong>
          <p>서비스 연결과 로그인 상태를 안전하게 확인하는 중입니다.</p>
        </section>
      </main>
    );
  }

  if (authState.status === 'blocked') {
    return (
      <main className="auth-shell">
        <section className="auth-state-card" role="alert">
          <AuthBrand />
          <span className="auth-blocked-mark">!</span>
          <strong>프로그램을 사용할 수 없습니다</strong>
          <p>{authState.message}</p>
          <div className="auth-state-actions">
            <button
              type="button"
              className="auth-secondary-button"
              onClick={() => void window.localVideoManager.quitApp()}
            >
              종료
            </button>
            <button
              type="button"
              className="auth-primary-button"
              onClick={() => {
                setAuthState(null);
                void refreshAuthState();
              }}
            >
              다시 확인
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (authState.status === 'signed-out') {
    return (
      <main className="auth-shell">
        <section className="auth-login-card" aria-labelledby="auth-login-heading">
          <div className="auth-login-heading">
            <AuthBrand />
            <div>
              <span>LOCAL VIDEO MANAGER</span>
              <h1 id="auth-login-heading">로그인</h1>
            </div>
          </div>
          <p className="auth-login-description">관리자가 등록한 회사 계정으로 로그인해 주세요.</p>
          <form onSubmit={(event) => void signIn(event)}>
            <label className="auth-field">
              <span>아이디</span>
              <input
                aria-label="아이디"
                autoCapitalize="none"
                autoComplete="username"
                onChange={(event) => setAccountId(event.target.value)}
                placeholder="아이디 입력"
                required
                spellCheck={false}
                type="text"
                value={accountId}
              />
            </label>
            <label className="auth-field">
              <span>비밀번호</span>
              <input
                autoComplete="current-password"
                maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
                minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호 입력"
                required
                type="password"
                value={password}
              />
            </label>
            {loginError ? (
              <p className="auth-login-error" role="alert">
                {loginError}
              </p>
            ) : null}
            <button
              className="auth-primary-button auth-login-button"
              disabled={submitting}
              type="submit"
            >
              {submitting ? <span className="auth-button-spinner" /> : null}
              {submitting ? '로그인 중…' : '로그인'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <App
      captionEnabled={authState.permissions.caption}
      captionDailyUsage={authState.dailyUsage}
      currentUser={authState.user}
      onCaptionDailyUsageChange={updateCaptionDailyUsage}
      onChangePassword={changePassword}
      onSignOut={signOut}
    />
  );
}
