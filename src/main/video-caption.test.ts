import { describe, expect, it } from 'vitest';

import {
  buildVideoCaptionPrompt,
  parseGeneratedVideoCaption,
  parseGeneratedVideoScreenText,
  parseVideoCaptionCopywritingType,
  parseVideoCaptionGenerationRequest,
  parseVideoCaptionTargetLanguage,
  parseVideoCaptionVariationId,
} from './video-caption';

describe('video caption parsing', () => {
  it('accepts the three supported target languages', () => {
    expect(['ko', 'ja', 'en'].map(parseVideoCaptionTargetLanguage)).toEqual(['ko', 'ja', 'en']);
  });

  it('rejects an unsupported target language', () => {
    expect(() => parseVideoCaptionTargetLanguage('fr')).toThrow(
      'Invalid video caption target language.',
    );
  });

  it('accepts only the four caption variations', () => {
    expect([1, 2, 3, 4].map(parseVideoCaptionVariationId)).toEqual([1, 2, 3, 4]);
    expect(() => parseVideoCaptionVariationId(5)).toThrow('Invalid video caption variation.');
    expect(() => parseVideoCaptionVariationId('1')).toThrow('Invalid video caption variation.');
  });

  it('normalizes a generated caption and rejects empty text', () => {
    expect(parseGeneratedVideoCaption('  새 캡션  ')).toBe('새 캡션');
    expect(() => parseGeneratedVideoCaption('   ')).toThrow('Invalid generated video caption.');
  });

  it('normalizes generated screen text and enforces the 15-character limit', () => {
    expect(parseGeneratedVideoScreenText('  무너진 담장의 비밀  ')).toBe('무너진 담장의 비밀');
    expect(() => parseGeneratedVideoScreenText('   ')).toThrow(
      'Invalid generated video screen text.',
    );
    expect(() => parseGeneratedVideoScreenText('1234567890123456')).toThrow(
      'Invalid generated video screen text.',
    );
  });

  it('accepts only the two supported copywriting types', () => {
    expect(parseVideoCaptionCopywritingType('field-report')).toBe('field-report');
    expect(parseVideoCaptionCopywritingType('calm-analyst')).toBe('calm-analyst');
    expect(() => parseVideoCaptionCopywritingType('viral')).toThrow(
      'Invalid video caption copywriting type.',
    );
  });

  it('parses the source caption and all selected generation options', () => {
    expect(
      parseVideoCaptionGenerationRequest({
        copywritingType: 'field-report',
        sourceCaption: '  원본 캡션  ',
        targetLanguage: 'ja',
        variationId: 3,
      }),
    ).toEqual({
      copywritingType: 'field-report',
      sourceCaption: '원본 캡션',
      targetLanguage: 'ja',
      variationId: 3,
    });
    expect(() => parseVideoCaptionGenerationRequest(null)).toThrow(
      'Invalid video caption generation request.',
    );
    expect(() =>
      parseVideoCaptionGenerationRequest({
        copywritingType: 'field-report',
        sourceCaption: '   ',
        targetLanguage: 'ko',
        variationId: 1,
      }),
    ).toThrow('Invalid source caption.');
  });
});

describe('buildVideoCaptionPrompt', () => {
  it('sends the original caption and selected options as an isolated rewrite request', () => {
    const prompt = buildVideoCaptionPrompt({
      copywritingType: 'field-report',
      sourceCaption: '古いコンクリートの壁が崩れた。',
      targetLanguage: 'ko',
      variationId: 3,
    });

    expect(prompt).toContain('대상 언어: 한국어');
    expect(prompt).toContain('인트로 스타일: 3번 시각/청각 묘사형');
    expect(prompt).toContain('카피라이팅: 현장감 중계');
    expect(prompt).toContain('古いコンクリートの壁が崩れた。');
    expect(prompt).toContain('실제 상황 현장입니다');
    expect(prompt).toContain('상단 화면 자막은 15자 이내의 호기심 유발 상황 묘사');
    expect(prompt).toContain('하단 화면 자막은 15자 이내의 충격적인 결과 반전 묘사');
    expect(prompt).toContain('원문에 없는 사실을 추측하거나 만들어내지 않는다');
    expect(prompt).toContain('해당 언어권 사용자가 읽었을 때 번역투나 이질적인 표현이 없도록');
    expect(prompt).toContain('topText, bottomText, caption 필드만 가진 JSON 객체');
  });

  it('uses only the selected calm analyst structure', () => {
    const prompt = buildVideoCaptionPrompt({
      copywritingType: 'calm-analyst',
      sourceCaption: 'A wall collapsed after repeated kicks.',
      targetLanguage: 'en',
      variationId: 4,
    });

    expect(prompt).toContain('대상 언어: 영어');
    expect(prompt).toContain('인트로 스타일: 4번 상황 대조형');
    expect(prompt).toContain('카피라이팅: 차분한 미스터리 분석가');
    expect(prompt).toContain('안전 기준과 현장 구조');
    expect(prompt).toContain('안전 표준, 인프라, 동선');
    expect(prompt).toContain('사후 녹화 기록이 보존');
    expect(prompt).toContain('상단 화면 자막은 15자 이내의 사건명 또는 사건을 식별하는 명칭');
    expect(prompt).toContain('하단 화면 자막은 15자 이내의 핵심 원인과 인과 분석');
    expect(prompt).not.toContain('A계정과 B계정을 모두');
  });

  it.each([
    [1, '1번 의문/자문형'],
    [2, '2번 충격 사실 직구형'],
    [3, '3번 시각/청각 묘사형'],
    [4, '4번 상황 대조형'],
  ] as const)('includes the selected variation %s specification', (variationId, label) => {
    const prompt = buildVideoCaptionPrompt({
      copywritingType: 'field-report',
      sourceCaption: '원본',
      targetLanguage: 'ko',
      variationId,
    });

    expect(prompt).toContain(`인트로 스타일: ${label}`);
  });

  it.each([
    ['ko', '한국어'],
    ['ja', '일본어'],
    ['en', '영어'],
  ] as const)('includes the selected %s target language', (targetLanguage, label) => {
    const prompt = buildVideoCaptionPrompt({
      copywritingType: 'field-report',
      sourceCaption: '원본',
      targetLanguage,
      variationId: 1,
    });

    expect(prompt).toContain(`대상 언어: ${label}`);
  });
});
