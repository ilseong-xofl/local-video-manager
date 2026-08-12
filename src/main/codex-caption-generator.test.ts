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
    const runCodexExec = vi.fn().mockResolvedValue('{"caption":"  새로 작성한 캡션  "}');
    const generator = new CodexExecVideoCaptionGenerator(runCodexExec);

    await expect(generator.generate(request)).resolves.toEqual({
      caption: '새로 작성한 캡션',
    });
    expect(runCodexExec).toHaveBeenCalledOnce();
    expect(runCodexExec.mock.calls[0][0]).toContain(request.sourceCaption);
    expect(runCodexExec.mock.calls[0][0]).toContain('충격 사실 직구형');
  });
});

describe('parseCodexCaptionResponse', () => {
  it('accepts only a JSON object with a non-empty caption', () => {
    expect(parseCodexCaptionResponse('{"caption":"결과"}')).toBe('결과');
    expect(() => parseCodexCaptionResponse('결과')).toThrow(
      'Codex returned an invalid caption response.',
    );
    expect(() => parseCodexCaptionResponse('{"caption":"   "}')).toThrow(
      'Invalid generated video caption.',
    );
  });
});
