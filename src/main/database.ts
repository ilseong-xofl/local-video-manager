import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

const LIBRARY_ID_KEY = 'library_id';
const LIBRARY_ROOT_KEY = 'library_root';

interface SettingRow {
  value: string;
}

export class AppDatabase {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.migrate();
  }

  public getOrCreateLibraryId(): string {
    const existing = this.getSetting(LIBRARY_ID_KEY);
    if (existing) {
      return existing;
    }

    const libraryId = randomUUID();
    this.setSetting(LIBRARY_ID_KEY, libraryId);
    return libraryId;
  }

  public getLibraryRoot(): string | null {
    return this.getSetting(LIBRARY_ROOT_KEY);
  }

  public setLibraryRoot(rootPath: string): void {
    this.setSetting(LIBRARY_ROOT_KEY, rootPath);
  }

  public close(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private getSetting(key: string): string | null {
    const row = this.database.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      SettingRow | undefined;

    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    this.database
      .prepare(
        `
          INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
      )
      .run(key, value, new Date().toISOString());
  }
}
