const COMPACT_VIEW_COUNT_PATTERN = /^(\d+(?:\.\d+)?)\s*([KM])?$/i;
const VIEW_COUNT_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

export function parseVideoViewCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid video view count.');
  }

  return value;
}

export function parseVideoViewCountInput(value: string): number {
  const normalized = value.trim().replaceAll(',', '');
  const match = COMPACT_VIEW_COUNT_PATTERN.exec(normalized);
  if (!match) {
    throw new Error('Invalid video view count.');
  }

  const amount = Number(match[1]);
  const suffix = match[2]?.toUpperCase();
  if (!suffix && !Number.isInteger(amount)) {
    throw new Error('Invalid video view count.');
  }

  const multiplier = suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return parseVideoViewCount(Math.round(amount * multiplier));
}

export function formatVideoViewCount(value: number): string {
  return VIEW_COUNT_FORMATTER.format(parseVideoViewCount(value));
}
