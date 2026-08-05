import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AppDatabase } from './database';

const temporaryDirectories: string[] = [];

function createDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-manager-test-'));
  temporaryDirectories.push(directory);
  return join(directory, 'app.sqlite');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('AppDatabase', () => {
  it('persists one stable library id', () => {
    const databasePath = createDatabasePath();
    const firstDatabase = new AppDatabase(databasePath);
    const libraryId = firstDatabase.getOrCreateLibraryId();
    firstDatabase.close();

    const reopenedDatabase = new AppDatabase(databasePath);
    expect(reopenedDatabase.getOrCreateLibraryId()).toBe(libraryId);
    reopenedDatabase.close();
  });

  it('stores the selected library root', () => {
    const database = new AppDatabase(createDatabasePath());
    expect(database.getLibraryRoot()).toBeNull();

    database.setLibraryRoot('/videos');
    expect(database.getLibraryRoot()).toBe('/videos');
    database.close();
  });
});
