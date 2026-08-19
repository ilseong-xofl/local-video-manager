import { VIDEO_CAPTION_DAILY_LIMIT } from '../shared/contracts';

export const CAPTION_NETWORK_RESTRICTION_MESSAGE = '캡션 생성은 사내 네트워크에서만 가능합니다.';
export const CAPTION_DAILY_LIMIT_MESSAGE = `오늘 사용할 수 있는 캡션 생성 ${VIDEO_CAPTION_DAILY_LIMIT}회를 모두 사용했습니다.`;

const DEFAULT_CAPTION_GENERATION_ERROR_MESSAGE =
  '새 캡션을 생성하지 못했습니다. 로그인 상태와 서비스 연결을 확인하세요.';

export function getCaptionGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes(CAPTION_NETWORK_RESTRICTION_MESSAGE)) {
    return CAPTION_NETWORK_RESTRICTION_MESSAGE;
  }
  if (error instanceof Error && error.message.includes(CAPTION_DAILY_LIMIT_MESSAGE)) {
    return CAPTION_DAILY_LIMIT_MESSAGE;
  }

  return DEFAULT_CAPTION_GENERATION_ERROR_MESSAGE;
}
