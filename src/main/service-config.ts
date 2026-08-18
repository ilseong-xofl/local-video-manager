const DEFAULT_DEVELOPMENT_SERVICE_URL = 'http://localhost:13080';

export function resolveServiceBaseUrl(
  runtimeValue = process.env.LOCAL_VIDEO_MANAGER_SERVICE_URL,
  buildValue = typeof LVM_SERVICE_URL === 'string' ? LVM_SERVICE_URL : '',
  packaged = false,
): string {
  const configuredValue =
    runtimeValue?.trim() || buildValue.trim() || (packaged ? '' : DEFAULT_DEVELOPMENT_SERVICE_URL);
  if (!configuredValue) {
    throw new Error('서비스 주소가 설정되지 않았습니다.');
  }

  const url = new URL(configuredValue);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('서비스 주소 형식이 올바르지 않습니다.');
  }
  if (packaged && url.protocol !== 'https:') {
    throw new Error('배포된 프로그램은 HTTPS 서비스만 사용할 수 있습니다.');
  }
  if (!packaged && !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('서비스 주소는 HTTP 또는 HTTPS여야 합니다.');
  }

  return url.toString().replace(/\/$/, '');
}
