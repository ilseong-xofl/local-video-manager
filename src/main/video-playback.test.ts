import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AppDatabase } from './database';
import {
  buildVideoPlaybackUrl,
  parseVideoPlaybackUrl,
  resolveVideoPlaybackPath,
} from './video-playback';
import type { ScannedVideoFile } from './video-scanner';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-playback-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function scannedVideo(relativePath: string, contentHash: string): ScannedVideoFile {
  return {
    contentHash,
    fileName: relativePath.split('/').at(-1) ?? relativePath,
    modifiedAtMs: 1_000,
    relativePath,
    sizeBytes: 10,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('video playback URL', () => {
  it('round-trips a SHA-256 hash without exposing a file path', () => {
    const contentHash = 'a'.repeat(64);
    const playbackUrl = buildVideoPlaybackUrl(contentHash);

    expect(playbackUrl).toBe(`local-video://media/${contentHash}`);
    expect(parseVideoPlaybackUrl(playbackUrl)).toBe(contentHash);
    expect(playbackUrl).not.toContain('/Users/');
  });

  it('rejects malformed playback URLs', () => {
    expect(parseVideoPlaybackUrl('local-video://other/' + 'a'.repeat(64))).toBeNull();
    expect(parseVideoPlaybackUrl('local-video://media/not-a-hash')).toBeNull();
    expect(parseVideoPlaybackUrl('https://media/' + 'a'.repeat(64))).toBeNull();
  });
});

describe('resolveVideoPlaybackPath', () => {
  it('resolves an available indexed file inside the selected root', async () => {
    const directory = createTemporaryDirectory();
    const libraryRoot = join(directory, 'videos');
    const videoPath = join(libraryRoot, 'nested', 'first.mp4');
    mkdirSync(join(libraryRoot, 'nested'), { recursive: true });
    writeFileSync(videoPath, 'video');
    const database = new AppDatabase(join(directory, 'app.sqlite'));
    const contentHash = 'a'.repeat(64);
    database.setLibraryRoot(libraryRoot);
    database.syncVideoFiles([scannedVideo('nested/first.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    await expect(resolveVideoPlaybackPath(database, contentHash)).resolves.toBe(videoPath);
    await expect(resolveVideoPlaybackPath(database, 'b'.repeat(64))).resolves.toBeNull();
    rmSync(videoPath);
    await expect(resolveVideoPlaybackPath(database, contentHash)).resolves.toBeNull();
    database.close();
  });

  it('rejects an indexed path outside the selected root', async () => {
    const directory = createTemporaryDirectory();
    const libraryRoot = join(directory, 'videos');
    mkdirSync(libraryRoot, { recursive: true });
    writeFileSync(join(directory, 'outside.mp4'), 'video');
    const database = new AppDatabase(join(directory, 'app.sqlite'));
    const contentHash = 'a'.repeat(64);
    database.setLibraryRoot(libraryRoot);
    database.syncVideoFiles([scannedVideo('../outside.mp4', contentHash)], {
      hashedFileCount: 1,
      reusedHashCount: 0,
    });

    await expect(resolveVideoPlaybackPath(database, contentHash)).resolves.toBeNull();
    database.close();
  });
});
