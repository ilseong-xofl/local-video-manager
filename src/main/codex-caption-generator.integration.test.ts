import { describe, expect, it } from 'vitest';

import { CodexExecVideoCaptionGenerator } from './codex-caption-generator';

const runIntegrationTest = process.env.RUN_CODEX_CAPTION_INTEGRATION === '1';

describe.runIf(runIntegrationTest)('Codex caption generation integration', () => {
  it('rewrites a source caption through a real codex exec process', async () => {
    const generator = new CodexExecVideoCaptionGenerator();
    const result = await generator.generate({
      copywritingType: 'calm-analyst',
      sourceCaption:
        '下校途中、学生たちが古いコンクリートの塀を順番に蹴った。塀はひび割れ、最後の衝撃で崩れた。',
      targetLanguage: 'ko',
      variationId: 3,
    });

    console.info(`\n[codex caption integration result]\n${result.caption}\n`);
    expect(result.caption).toMatch(/[가-힣]/);
    expect(result.caption.length).toBeGreaterThan(100);
    expect(result.caption).toContain('\n\n');
    expect(result.caption).toContain('#');
  }, 190_000);
});
