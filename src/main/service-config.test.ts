import { describe, expect, it } from 'vitest';

import { resolveServiceBaseUrl } from './service-config';

describe('resolveServiceBaseUrl', () => {
  it('uses the runtime value before the build value and removes a trailing slash', () => {
    expect(
      resolveServiceBaseUrl('http://localhost:13080/', 'https://build.example.com', false),
    ).toBe('http://localhost:13080');
  });

  it('uses the trusted local proxy by default in development', () => {
    expect(resolveServiceBaseUrl('', '', false)).toBe('http://localhost:13080');
  });

  it('requires HTTPS in a packaged application', () => {
    expect(() => resolveServiceBaseUrl('http://service.example.com', '', true)).toThrow(
      '배포된 프로그램은 HTTPS 서비스만 사용할 수 있습니다.',
    );
    expect(resolveServiceBaseUrl('https://service.example.com/', '', true)).toBe(
      'https://service.example.com',
    );
  });

  it('rejects a missing packaged URL or a credential-bearing URL', () => {
    expect(() => resolveServiceBaseUrl('', '', true)).toThrow('서비스 주소가 설정되지 않았습니다.');
    expect(() => resolveServiceBaseUrl('https://user:secret@example.com', '', false)).toThrow(
      '서비스 주소 형식이 올바르지 않습니다.',
    );
  });
});
