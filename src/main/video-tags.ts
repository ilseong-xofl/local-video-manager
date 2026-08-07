import { VIDEO_TAG_NAME_MAX_LENGTH } from '../shared/contracts';

export function parseVideoTagName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid video tag name.');
  }

  const name = value.trim().normalize('NFC');
  if (!name || name.length > VIDEO_TAG_NAME_MAX_LENGTH) {
    throw new Error('Invalid video tag name.');
  }

  return name;
}

export function parseVideoTagId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Invalid video tag ID.');
  }

  return value;
}

export function parseVideoTagIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid video tag IDs.');
  }

  const tagIds = value.map(parseVideoTagId);
  if (new Set(tagIds).size !== tagIds.length) {
    throw new Error('Invalid video tag IDs.');
  }

  return tagIds;
}
