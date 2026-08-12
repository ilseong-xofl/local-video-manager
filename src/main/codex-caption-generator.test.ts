import { describe, expect, it, vi } from 'vitest';

import type { VideoCaptionGenerationRequest } from '../shared/contracts';
import {
  CodexExecVideoCaptionGenerator,
  parseCodexCaptionResponse,
} from './codex-caption-generator';

const request: VideoCaptionGenerationRequest = {
  copywritingType: 'field-report',
  sourceCaption: '古い壁が崩れた。',
  targetLanguage: 'ko',
  variationId: 2,
};

describe('CodexExecVideoCaptionGenerator', () => {
  it('passes the complete prompt to the runner and returns its structured caption', async () => {
    const runCodexExec = vi
      .fn()
      .mockResolvedValue(
        '{"topText":"  무너진 담장의 비밀  ","bottomText":"순간의 충격","caption":"  새로 작성한 캡션  "}',
      );
    const generator = new CodexExecVideoCaptionGenerator(runCodexExec);

    await expect(generator.generate(request)).resolves.toEqual({
      bottomText: '순간의 충격',
      caption: '새로 작성한 캡션',
      topText: '무너진 담장의 비밀',
    });
    expect(runCodexExec).toHaveBeenCalledOnce();
    expect(runCodexExec.mock.calls[0][0]).toContain(request.sourceCaption);
    expect(runCodexExec.mock.calls[0][0]).toContain('충격 사실 직구형');
  });
});

describe('parseCodexCaptionResponse', () => {
  it('accepts only a JSON object with top, bottom, and caption text', () => {
    expect(
      parseCodexCaptionResponse(
        '{"topText":"담장의 균열","bottomText":"무너진 순간","caption":"결과"}',
      ),
    ).toEqual({ bottomText: '무너진 순간', caption: '결과', topText: '담장의 균열' });
    expect(() => parseCodexCaptionResponse('결과')).toThrow(
      'Codex returned an invalid caption response.',
    );
    expect(() => parseCodexCaptionResponse('{"caption":"결과"}')).toThrow(
      'Codex returned an invalid caption response.',
    );
    expect(() =>
      parseCodexCaptionResponse(
        '{"topText":"1234567890123456","bottomText":"하단","caption":"결과"}',
      ),
    ).toThrow('Invalid generated video screen text.');
    expect(() =>
      parseCodexCaptionResponse(
        '{"topText":"상단","bottomText":"하단","caption":"결과","extra":"금지"}',
      ),
    ).toThrow('Codex returned an invalid caption response.');
    expect(() =>
      parseCodexCaptionResponse('{"topText":"상단","bottomText":"하단","caption":"   "}'),
    ).toThrow('Invalid generated video caption.');
  });
});
