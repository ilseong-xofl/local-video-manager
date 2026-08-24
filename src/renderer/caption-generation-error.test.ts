import { describe, expect, it } from 'vitest';

import {
  CAPTION_DAILY_LIMIT_MESSAGE,
  CAPTION_NETWORK_RESTRICTION_MESSAGE,
  getCaptionGenerationErrorMessage,
} from './caption-generation-error';

describe('caption generation error message', () => {
  it('shows the company-network warning returned through Electron IPC', () => {
    const error = new Error(
      `Error invoking remote method 'video-caption:generate': Error: ${CAPTION_NETWORK_RESTRICTION_MESSAGE}`,
    );

    expect(getCaptionGenerationErrorMessage(error)).toBe(CAPTION_NETWORK_RESTRICTION_MESSAGE);
  });

  it('shows the KST daily quota warning returned through Electron IPC', () => {
    const error = new Error(
      "Error invoking remote method 'video-caption:generate': Error: 오늘 사용할 수 있는 캡션 생성 30회를 모두 사용했습니다.",
    );

    expect(getCaptionGenerationErrorMessage(error)).toBe(CAPTION_DAILY_LIMIT_MESSAGE);
  });

  it('does not expose unexpected service errors', () => {
    expect(getCaptionGenerationErrorMessage(new Error('sensitive internal detail'))).toBe(
      '새 캡션을 생성하지 못했습니다. 로그인 상태와 서비스 연결을 확인하세요.',
    );
  });
});
