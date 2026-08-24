export const CAPTION_NETWORK_RESTRICTION_MESSAGE = '캡션 생성은 사내 네트워크에서만 가능합니다.';
export const CAPTION_DAILY_LIMIT_MESSAGE =
  '오늘 생성 횟수를 모두 사용했습니다. KST 자정에 초기화됩니다.';

const CAPTION_DAILY_LIMIT_SERVER_MESSAGE_PREFIX = '오늘 사용할 수 있는 캡션 생성 ';
const CAPTION_DAILY_LIMIT_SERVER_MESSAGE_SUFFIX = '회를 모두 사용했습니다.';

const DEFAULT_CAPTION_GENERATION_ERROR_MESSAGE =
  '새 캡션을 생성하지 못했습니다. 로그인 상태와 서비스 연결을 확인하세요.';

export function getCaptionGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes(CAPTION_NETWORK_RESTRICTION_MESSAGE)) {
    return CAPTION_NETWORK_RESTRICTION_MESSAGE;
  }
  if (
    error instanceof Error &&
    error.message.includes(CAPTION_DAILY_LIMIT_SERVER_MESSAGE_PREFIX) &&
    error.message.includes(CAPTION_DAILY_LIMIT_SERVER_MESSAGE_SUFFIX)
  ) {
    return CAPTION_DAILY_LIMIT_MESSAGE;
  }

  return DEFAULT_CAPTION_GENERATION_ERROR_MESSAGE;
}
