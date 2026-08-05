import { describe, expect, it } from 'vitest';

import { normalizeGitHubRepository } from './github-repository';

describe('normalizeGitHubRepository', () => {
  it('accepts an owner and repository pair', () => {
    expect(normalizeGitHubRepository(' team-name/local-video-manager ')).toBe(
      'team-name/local-video-manager',
    );
  });

  it.each(['', 'owner', 'owner/repository/extra', 'owner / repository'])(
    'rejects an invalid repository value: %s',
    (value) => {
      expect(normalizeGitHubRepository(value)).toBeNull();
    },
  );
});
