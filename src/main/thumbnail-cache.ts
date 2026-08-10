import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export type CreateThumbnail = (videoPath: string) => Promise<Buffer | null>;

function toJpegDataUrl(image: Buffer): string {
  return `data:image/jpeg;base64,${image.toString('base64')}`;
}

export function resolveLibraryFilePath(libraryRoot: string, relativePath: string): string | null {
  const resolvedRoot = resolve(libraryRoot);
  const resolvedFile = resolve(resolvedRoot, relativePath);

  if (!resolvedFile.startsWith(`${resolvedRoot}${sep}`)) {
    return null;
  }

  return resolvedFile;
}

export class ThumbnailCache {
  private readonly pending = new Map<string, Promise<string | null>>();

  public constructor(
    private readonly cacheDirectory: string,
    private readonly createThumbnail: CreateThumbnail,
  ) {}

  public getThumbnailDataUrl(contentHash: string, videoPath: string): Promise<string | null> {
    if (!CONTENT_HASH_PATTERN.test(contentHash)) {
      return Promise.reject(new Error('Invalid video content hash.'));
    }

    const pendingThumbnail = this.pending.get(contentHash);
    if (pendingThumbnail) {
      return pendingThumbnail;
    }

    const thumbnail = this.loadOrCreateThumbnail(contentHash, videoPath).finally(() => {
      this.pending.delete(contentHash);
    });
    this.pending.set(contentHash, thumbnail);
    return thumbnail;
  }

  public async getCachedThumbnailDataUrl(contentHash: string): Promise<string | null> {
    if (!CONTENT_HASH_PATTERN.test(contentHash)) {
      throw new Error('Invalid video content hash.');
    }

    try {
      return toJpegDataUrl(await readFile(join(this.cacheDirectory, `${contentHash}.jpg`)));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async loadOrCreateThumbnail(
    contentHash: string,
    videoPath: string,
  ): Promise<string | null> {
    await mkdir(this.cacheDirectory, { recursive: true });
    const cachePath = join(this.cacheDirectory, `${contentHash}.jpg`);

    try {
      return toJpegDataUrl(await readFile(cachePath));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }

    const image = await this.createThumbnail(videoPath);
    if (!image) {
      return null;
    }

    await writeFile(cachePath, image);
    return toJpegDataUrl(image);
  }
}
