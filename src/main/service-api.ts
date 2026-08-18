import { randomUUID } from 'node:crypto';

import type {
  AppAuthState,
  VideoCaptionGenerationRequest,
  VideoCaptionGenerationResult,
} from '../shared/contracts';
import { parseGeneratedVideoCaption, parseGeneratedVideoScreenText } from './video-caption';
import type { AuthTokenStore } from './auth-token-store';
import type { VideoCaptionGenerator } from './codex-caption-generator';

const ACCESS_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 20_000;
const CAPTION_TIMEOUT_MS = 180_000;

interface ServiceErrorBody {
  code: string;
  message: string;
}

type FetchImplementation = typeof fetch;

export class ServiceApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ServiceApiError';
  }
}

function parseErrorBody(value: unknown): ServiceErrorBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const candidate =
    body.error && typeof body.error === 'object' && !Array.isArray(body.error)
      ? (body.error as Record<string, unknown>)
      : body;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
    ? { code: candidate.code, message: candidate.message }
    : null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceApiError('서버 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
  }
}

function parseAccessState(value: unknown): Extract<AppAuthState, { status: 'authenticated' }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceApiError('서버 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
  }
  const body = value as Record<string, unknown>;
  const user = body.user as Record<string, unknown> | undefined;
  const permissions = body.permissions as Record<string, unknown> | undefined;
  if (
    !user ||
    typeof user.displayName !== 'string' ||
    typeof user.email !== 'string' ||
    !permissions ||
    typeof permissions.caption !== 'boolean'
  ) {
    throw new ServiceApiError('서버 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
  }

  return {
    permissions: { caption: permissions.caption },
    status: 'authenticated',
    user: { displayName: user.displayName, email: user.email },
  };
}

function parseCaptionResult(value: unknown): VideoCaptionGenerationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceApiError('캡션 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== 3 ||
    Object.keys(body).some((key) => !['topText', 'bottomText', 'caption'].includes(key))
  ) {
    throw new ServiceApiError('캡션 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
  }

  try {
    return {
      bottomText: parseGeneratedVideoScreenText(body.bottomText),
      caption: parseGeneratedVideoCaption(body.caption),
      topText: parseGeneratedVideoScreenText(body.topText),
    };
  } catch {
    throw new ServiceApiError('캡션 응답 형식이 올바르지 않습니다.', 'INVALID_RESPONSE', 502);
  }
}

function blockedState(error: ServiceApiError): Extract<AppAuthState, { status: 'blocked' }> {
  if (error.code === 'NETWORK_NOT_ALLOWED') {
    return {
      message: '허용된 회사 네트워크에서만 프로그램을 사용할 수 있습니다.',
      reason: 'network',
      status: 'blocked',
    };
  }
  if (
    ['ACCOUNT_DISABLED', 'APP_ACCESS_DENIED', 'ADMIN_REQUIRED', 'CAPTION_ACCESS_DENIED'].includes(
      error.code,
    )
  ) {
    return { message: error.message, reason: 'access', status: 'blocked' };
  }
  return {
    message: '서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    reason: 'service',
    status: 'blocked',
  };
}

export class ServiceApiClient implements VideoCaptionGenerator {
  constructor(
    private readonly baseUrl: string | null,
    private readonly tokenStore: AuthTokenStore,
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly configurationError = '서비스 주소가 설정되지 않았습니다.',
  ) {}

  private async request(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    token?: string | null,
  ): Promise<Response> {
    if (!this.baseUrl) {
      throw new ServiceApiError(this.configurationError, 'SERVICE_NOT_CONFIGURED', 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImplementation(`${this.baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Origin: this.baseUrl,
          'X-Client-Request-Id': randomUUID(),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof ServiceApiError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new ServiceApiError('서비스 응답 시간이 초과되었습니다.', 'REQUEST_TIMEOUT', 504);
      }
      throw new ServiceApiError('서비스에 연결할 수 없습니다.', 'SERVICE_UNAVAILABLE', 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async toApiError(response: Response): Promise<ServiceApiError> {
    const body = parseErrorBody(await readJson(response));
    return new ServiceApiError(
      body?.message ?? '요청을 처리하지 못했습니다.',
      body?.code ?? 'REQUEST_FAILED',
      response.status,
    );
  }

  private async requestAccess(token: string | null): Promise<AppAuthState> {
    const response = await this.request(
      '/api/v1/access',
      { method: 'GET' },
      ACCESS_TIMEOUT_MS,
      token,
    );
    if (response.ok) {
      return parseAccessState(await readJson(response));
    }

    const error = await this.toApiError(response);
    if (error.status === 401 || error.code === 'AUTH_REQUIRED') {
      if (token) {
        await this.tokenStore.clear();
      }
      return { status: 'signed-out' };
    }
    return blockedState(error);
  }

  async getAuthState(): Promise<AppAuthState> {
    if (!this.baseUrl) {
      return {
        message: this.configurationError,
        reason: 'configuration',
        status: 'blocked',
      };
    }

    try {
      return await this.requestAccess(await this.tokenStore.read());
    } catch (error) {
      if (error instanceof ServiceApiError) {
        return blockedState(error);
      }
      return {
        message: '운영체제 보안 저장소를 사용할 수 없습니다.',
        reason: 'configuration',
        status: 'blocked',
      };
    }
  }

  async signIn(email: string, password: string): Promise<AppAuthState> {
    if (!email.trim() || !password) {
      throw new ServiceApiError('아이디와 비밀번호를 입력해 주세요.', 'AUTH_INVALID', 400);
    }

    const response = await this.request(
      '/api/auth/sign-in/email',
      {
        body: JSON.stringify({ email: email.trim(), password, rememberMe: true }),
        method: 'POST',
      },
      AUTH_TIMEOUT_MS,
    );
    if (!response.ok) {
      const error = await this.toApiError(response);
      if (error.code === 'NETWORK_NOT_ALLOWED') {
        throw new ServiceApiError(
          '허용된 회사 네트워크에서만 프로그램을 사용할 수 있습니다.',
          error.code,
          error.status,
        );
      }
      if (error.status === 429) {
        throw new ServiceApiError(
          '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          'RATE_LIMITED',
          429,
        );
      }
      throw new ServiceApiError('아이디 또는 비밀번호를 확인해 주세요.', 'AUTH_INVALID', 401);
    }

    await readJson(response);
    const token = response.headers.get('set-auth-token')?.trim();
    if (!token) {
      throw new ServiceApiError('로그인 응답에 인증 정보가 없습니다.', 'INVALID_RESPONSE', 502);
    }
    await this.tokenStore.write(token);

    const state = await this.requestAccess(token);
    if (state.status !== 'authenticated') {
      await this.tokenStore.clear();
      throw new ServiceApiError(
        state.status === 'blocked' ? state.message : '로그인할 수 없습니다.',
        'APP_ACCESS_DENIED',
        403,
      );
    }
    return state;
  }

  async signOut(): Promise<AppAuthState> {
    try {
      const token = await this.tokenStore.read();
      if (token && this.baseUrl) {
        const response = await this.request(
          '/api/auth/sign-out',
          { method: 'POST' },
          AUTH_TIMEOUT_MS,
          token,
        );
        if (response.ok) {
          await readJson(response);
        }
      }
    } catch {
      // Local sign-out must still remove the token if the service is unavailable.
    } finally {
      await this.tokenStore.clear();
    }
    return { status: 'signed-out' };
  }

  async generate(request: VideoCaptionGenerationRequest): Promise<VideoCaptionGenerationResult> {
    const accessState = await this.getAuthState();
    if (accessState.status !== 'authenticated') {
      const message =
        accessState.status === 'blocked' ? accessState.message : '로그인이 필요합니다.';
      throw new ServiceApiError(message, 'AUTH_REQUIRED', 401);
    }
    if (!accessState.permissions.caption) {
      throw new ServiceApiError('캡션 생성 권한이 없습니다.', 'CAPTION_ACCESS_DENIED', 403);
    }

    const token = await this.tokenStore.read();
    if (!token) {
      throw new ServiceApiError('로그인이 필요합니다.', 'AUTH_REQUIRED', 401);
    }
    const response = await this.request(
      '/api/v1/captions/generate',
      { body: JSON.stringify(request), method: 'POST' },
      CAPTION_TIMEOUT_MS,
      token,
    );
    if (!response.ok) {
      const error = await this.toApiError(response);
      if (error.status === 401) {
        await this.tokenStore.clear();
      }
      throw error;
    }
    return parseCaptionResult(await readJson(response));
  }
}
