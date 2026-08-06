import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';

const VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
  '.wmv',
]);
const MAX_FOLDER_DEPTH = 3;

export interface CachedVideoFile {
  contentHash: string;
  modifiedAtMs: number;
  relativePath: string;
  sizeBytes: number;
}

export interface ScannedVideoFile extends CachedVideoFile {
  fileName: string;
}

export interface VideoDirectoryScan {
  excludedDirectoryCount: number;
  files: ScannedVideoFile[];
  hashedFileCount: number;
  reusedHashCount: number;
}

function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function normalizeRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath).split(sep).join('/');
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function collectVideoPaths(
  rootPath: string,
): Promise<{ excludedDirectoryCount: number; videoPaths: string[] }> {
  const directories = [{ depth: 1, path: rootPath }];
  const videoPaths: string[] = [];
  let excludedDirectoryCount = 0;

  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) {
      break;
    }

    const entries = await readdir(directory.path, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const entryPath = join(directory.path, entry.name);
      if (entry.isDirectory()) {
        if (directory.depth < MAX_FOLDER_DEPTH) {
          directories.push({ depth: directory.depth + 1, path: entryPath });
        } else {
          excludedDirectoryCount += 1;
        }
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        videoPaths.push(entryPath);
      }
    }
  }

  return {
    excludedDirectoryCount,
    videoPaths: videoPaths.sort((left, right) => left.localeCompare(right)),
  };
}

export async function scanVideoDirectory(
  rootPath: string,
  cachedFiles: readonly CachedVideoFile[],
): Promise<VideoDirectoryScan> {
  const cachedByPath = new Map(cachedFiles.map((file) => [file.relativePath, file]));
  const files: ScannedVideoFile[] = [];
  let hashedFileCount = 0;
  let reusedHashCount = 0;
  const collected = await collectVideoPaths(rootPath);

  for (const filePath of collected.videoPaths) {
    const fileStat = await stat(filePath);
    const relativePath = normalizeRelativePath(rootPath, filePath);
    const modifiedAtMs = Math.trunc(fileStat.mtimeMs);
    const cachedFile = cachedByPath.get(relativePath);
    const canReuseHash =
      cachedFile?.sizeBytes === fileStat.size && cachedFile.modifiedAtMs === modifiedAtMs;
    const contentHash = canReuseHash ? cachedFile.contentHash : await hashFile(filePath);

    if (canReuseHash) {
      reusedHashCount += 1;
    } else {
      hashedFileCount += 1;
    }

    files.push({
      contentHash,
      fileName: basename(filePath),
      modifiedAtMs,
      relativePath,
      sizeBytes: fileStat.size,
    });
  }

  return {
    excludedDirectoryCount: collected.excludedDirectoryCount,
    files,
    hashedFileCount,
    reusedHashCount,
  };
}
