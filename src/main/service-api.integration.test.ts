import { describe, expect, it } from 'vitest';

import type { AuthTokenStore } from './auth-token-store';
import { ServiceApiClient } from './service-api';

class IntegrationTokenStore implements AuthTokenStore {
  private token: string | null = null;

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

const runIntegrationTest = process.env.RUN_SERVICE_API_INTEGRATION === '1';

describe.runIf(runIntegrationTest)('service API integration', () => {
  it('logs in, verifies app access, generates one caption, and logs out', async () => {
    const serviceUrl = process.env.SERVICE_API_INTEGRATION_URL;
    const email = process.env.SERVICE_API_INTEGRATION_EMAIL;
    const password = process.env.SERVICE_API_INTEGRATION_PASSWORD;
    if (!serviceUrl || !email || !password) {
      throw new Error('Service API integration credentials are not configured.');
    }

    const tokenStore = new IntegrationTokenStore();
    const client = new ServiceApiClient(serviceUrl, tokenStore);
    const state = await client.signIn(email, password);
    expect(state.status).toBe('authenticated');

    const result = await client.generate({
      copywritingType: 'field-report',
      sourceCaption: '학생들이 낡은 담장을 발로 차자 균열이 생겼고 마지막 충격에 무너졌다.',
      targetLanguage: 'ko',
      variationId: 2,
    });
    expect(result.topText).toBeTruthy();
    expect(result.bottomText).toBeTruthy();
    expect(result.caption).toContain('[테스트 생성 결과]');

    await expect(client.signOut()).resolves.toEqual({ status: 'signed-out' });
  });
});
