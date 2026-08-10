import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanVideoDirectory } from './video-scanner';

const temporaryDirectories: string[] = [];

function createLibraryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-video-scanner-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('scanVideoDirectory', () => {
  it('finds supported videos recursively and hashes duplicate content once per file', async () => {
    const root = createLibraryRoot();
    mkdirSync(join(root, 'instagram', '2026'), { recursive: true });
    writeFileSync(join(root, 'intro.mp4'), 'same-video');
    writeFileSync(join(root, 'instagram', 'clip.MOV'), 'different-video');
    writeFileSync(join(root, 'instagram', '2026', 'duplicate.webm'), 'same-video');
    writeFileSync(join(root, 'notes.txt'), 'not-a-video');

    const result = await scanVideoDirectory(root, []);

    expect(result.files.map((file) => file.relativePath)).toEqual([
      'instagram/2026/duplicate.webm',
      'instagram/clip.MOV',
      'intro.mp4',
    ]);
    expect(result.files.map((file) => file.contentHash)).toEqual([
      sha256('same-video'),
      sha256('different-video'),
      sha256('same-video'),
    ]);
    expect(result.hashedFileCount).toBe(3);
    expect(result.reusedHashCount).toBe(0);
    expect(result.excludedDirectoryCount).toBe(0);
  });

  it('scans through three folder levels including the selected root', async () => {
    const root = createLibraryRoot();
    mkdirSync(join(root, 'B', 'C', 'D'), { recursive: true });
    writeFileSync(join(root, 'root.mp4'), 'root-video');
    writeFileSync(join(root, 'B', 'nested.mp4'), 'nested-video');
    writeFileSync(join(root, 'B', 'C', 'allowed.mp4'), 'allowed-video');
    writeFileSync(join(root, 'B', 'C', 'D', 'excluded.mp4'), 'excluded-video');

    const result = await scanVideoDirectory(root, []);

    expect(result.files.map((file) => file.relativePath)).toEqual([
      'B/C/allowed.mp4',
      'B/nested.mp4',
      'root.mp4',
    ]);
    expect(result.excludedDirectoryCount).toBe(1);
  });

  it('reuses hashes for unchanged paths and recalculates changed files', async () => {
    const root = createLibraryRoot();
    mkdirSync(join(root, 'nested'), { recursive: true });
    writeFileSync(join(root, 'first.mp4'), 'first');
    writeFileSync(join(root, 'nested', 'second.mkv'), 'second');

    const firstScan = await scanVideoDirectory(root, []);
    const unchangedScan = await scanVideoDirectory(root, firstScan.files);

    expect(unchangedScan.hashedFileCount).toBe(0);
    expect(unchangedScan.reusedHashCount).toBe(2);

    writeFileSync(join(root, 'nested', 'second.mkv'), 'second-updated');
    const changedScan = await scanVideoDirectory(root, unchangedScan.files);

    expect(changedScan.hashedFileCount).toBe(1);
    expect(changedScan.reusedHashCount).toBe(1);
    expect(
      changedScan.files.find((file) => file.relativePath === 'nested/second.mkv'),
    ).toMatchObject({ contentHash: sha256('second-updated') });
  });
});
