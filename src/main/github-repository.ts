const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function normalizeGitHubRepository(value: string): string | null {
  const repository = value.trim();
  return GITHUB_REPOSITORY_PATTERN.test(repository) ? repository : null;
}
