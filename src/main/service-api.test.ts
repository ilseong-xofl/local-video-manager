import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthTokenStore } from './auth-token-store';
import { ServiceApiClient, ServiceApiError } from './service-api';

class MemoryTokenStore implements AuthTokenStore {
  token: string | null = null;

  async clear() {
    this.token = null;
  }

  async read() {
    return this.token;
  }

  async write(token: string) {
    this.token = token;
  }
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...headers },
    status,
  });
}

const unusedDailyUsage = {
  limit: 5,
  remaining: 5,
  resetAt: '2026-08-18T15:00:00.000Z',
  timeZone: 'Asia/Seoul',
  used: 0,
};

const authenticatedAccess = {
  dailyUsage: unusedDailyUsage,
  permissions: { caption: true },
  user: { displayName: '테스트 사용자', email: 'user@example.com' },
};

describe('ServiceApiClient', () => {
  let tokenStore: MemoryTokenStore;

  beforeEach(() => {
    tokenStore = new MemoryTokenStore();
  });

  it('checks the company network even when no token is stored', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' } }, 401),
      );
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);

    await expect(client.getAuthState()).resolves.toEqual({ status: 'signed-out' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://service.example.com/api/v1/access',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('stores only the signed bearer header after login and verifies app access', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ user: { email: 'user@example.com' } }, 200, {
          'set-auth-token': 'signed-bearer-token',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(authenticatedAccess));
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);

    await expect(client.signIn(' user@example.com ', 'SecretPassword123!')).resolves.toEqual({
      ...authenticatedAccess,
      status: 'authenticated',
    });
    expect(tokenStore.token).toBe('signed-bearer-token');
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        email: 'user@example.com',
        password: 'SecretPassword123!',
        rememberMe: true,
      }),
    );
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Origin')).toBe(
      'https://service.example.com',
    );
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer signed-bearer-token',
    );
  });

  it('revalidates access and sends the exact caption contract without retrying', async () => {
    tokenStore.token = 'signed-bearer-token';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authenticatedAccess))
      .mockResolvedValueOnce(
        jsonResponse({
          bottomText: '무너진 순간',
          caption: '새 캡션',
          dailyUsage: { ...unusedDailyUsage, remaining: 4, used: 1 },
          topText: '담장의 균열',
        }),
      );
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);
    const request = {
      copywritingType: 'field-report' as const,
      sourceCaption: '古い壁が崩れた。',
      targetLanguage: 'ko' as const,
      variationId: 2 as const,
    };

    await expect(client.generate(request)).resolves.toEqual({
      bottomText: '무너진 순간',
      caption: '새 캡션',
      dailyUsage: { ...unusedDailyUsage, remaining: 4, used: 1 },
      topText: '담장의 균열',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://service.example.com/api/v1/captions/generate');
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify(request));
  });

  it('returns the company-network warning only when caption generation is denied', async () => {
    tokenStore.token = 'signed-bearer-token';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authenticatedAccess))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: 'NETWORK_NOT_ALLOWED',
              message: '캡션 생성은 사내 네트워크에서만 가능합니다.',
            },
          },
          403,
        ),
      );
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);

    await expect(
      client.generate({
        copywritingType: 'field-report',
        sourceCaption: '古い壁が崩れた。',
        targetLanguage: 'ko',
        variationId: 2,
      }),
    ).rejects.toMatchObject({
      code: 'NETWORK_NOT_ALLOWED',
      message: '캡션 생성은 사내 네트워크에서만 가능합니다.',
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send a generation request after the server reports 5/5 usage', async () => {
    tokenStore.token = 'signed-bearer-token';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        ...authenticatedAccess,
        dailyUsage: { ...unusedDailyUsage, remaining: 0, used: 5 },
      }),
    );
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);

    await expect(
      client.generate({
        copywritingType: 'field-report',
        sourceCaption: '古い壁が崩れた。',
        targetLanguage: 'ko',
        variationId: 2,
      }),
    ).rejects.toMatchObject({
      code: 'DAILY_CAPTION_LIMIT_REACHED',
      message: '오늘 사용할 수 있는 캡션 생성 5회를 모두 사용했습니다.',
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears an expired token and returns to the login state', async () => {
    tokenStore.token = 'expired-token';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' } }, 401),
      );
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);

    await expect(client.getAuthState()).resolves.toEqual({ status: 'signed-out' });
    expect(tokenStore.token).toBeNull();
  });

  it('does not retain a local token when logout cannot reach the service', async () => {
    tokenStore.token = 'signed-bearer-token';
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    const client = new ServiceApiClient('https://service.example.com', tokenStore, fetchMock);

    await expect(client.signOut()).resolves.toEqual({ status: 'signed-out' });
    expect(tokenStore.token).toBeNull();
  });

  it('fails closed when the service URL is unavailable', async () => {
    const client = new ServiceApiClient(null, tokenStore, vi.fn<typeof fetch>(), '설정 오류');

    await expect(client.getAuthState()).resolves.toEqual({
      message: '설정 오류',
      reason: 'configuration',
      status: 'blocked',
    });
    await expect(client.signIn('user@example.com', 'SecretPassword123!')).rejects.toBeInstanceOf(
      ServiceApiError,
    );
  });
});
