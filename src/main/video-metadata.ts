import {
  VIDEO_METADATA_SEARCH_MAX_LENGTH,
  VIDEO_SOURCE_CAPTION_MAX_LENGTH,
  VIDEO_SOURCE_URL_MAX_LENGTH,
  type VideoMetadataInput,
} from '../shared/contracts';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function normalizeOptionalString(
  value: unknown,
  maximumLength: number,
  fieldName: string,
): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}.`);
  }

  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maximumLength) {
    throw new Error(`${fieldName} is too long.`);
  }

  return normalized;
}

export function parseContentHash(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error('Invalid video content hash.');
  }

  return value;
}

export function parseOptionalContentHash(value: unknown): string | null {
  return value === null || value === undefined ? null : parseContentHash(value);
}

export function parseVideoMetadataSearchQuery(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid video metadata search query.');
  }

  const query = value.trim();
  if (!query || query.length > VIDEO_METADATA_SEARCH_MAX_LENGTH) {
    throw new Error('Invalid video metadata search query.');
  }

  return query;
}

export function parseVideoMetadataInput(value: unknown): VideoMetadataInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid video metadata.');
  }

  const input = value as Record<string, unknown>;
  const sourceUrl = normalizeOptionalString(
    input.sourceUrl,
    VIDEO_SOURCE_URL_MAX_LENGTH,
    'source URL',
  );
  const sourceCaption = normalizeOptionalString(
    input.sourceCaption,
    VIDEO_SOURCE_CAPTION_MAX_LENGTH,
    'source caption',
  );

  if (!sourceUrl && !sourceCaption) {
    throw new Error('A source URL or caption is required.');
  }

  if (sourceUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new Error('Source URL is invalid.');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Source URL must use HTTP or HTTPS.');
    }
  }

  return { sourceCaption, sourceUrl };
}
