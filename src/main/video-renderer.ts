import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { app } from 'electron';

import type { VideoRenderProgress, VideoRenderRequest } from '../shared/contracts';
import { buildFfmpegArguments, parseFfmpegDurationMs, parseFfmpegProgressMs } from './video-editor';

interface ActiveRender {
  cancelled: boolean;
  child: ChildProcessWithoutNullStreams;
  durationMs: number | null;
  jobId: string;
  lastProgress: number;
  outputPath: string;
  stderr: string;
  stdoutBuffer: string;
  temporaryDirectory: string;
  temporaryOutputPath: string;
}

type ProgressListener = (progress: VideoRenderProgress) => void;

function removeFileIfPresent(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function moveRenderedFileIntoPlace(temporaryPath: string, outputPath: string): void {
  const backupPath = `${outputPath}.${randomUUID()}.previous`;
  const destinationExists = existsSync(outputPath);

  try {
    if (destinationExists) {
      renameSync(outputPath, backupPath);
    }
    renameSync(temporaryPath, outputPath);
    removeFileIfPresent(backupPath);
  } catch (error) {
    if (destinationExists && existsSync(backupPath) && !existsSync(outputPath)) {
      renameSync(backupPath, outputPath);
    }
    throw error;
  }
}

function ffmpegBinaryPath(): string {
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return app.isPackaged
    ? join(process.resourcesPath, binaryName)
    : join(app.getAppPath(), 'node_modules', 'ffmpeg-static', binaryName);
}

function failureMessage(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1)?.slice(0, 500) ?? 'FFmpeg render failed.';
}

export class VideoRenderManager {
  private activeRender: ActiveRender | null = null;
  private readonly completedOutputs = new Map<string, string>();

  public start(
    inputPath: string,
    outputPath: string,
    request: VideoRenderRequest,
    onProgress: ProgressListener,
  ): string {
    if (this.activeRender) {
      throw new Error('A video render is already running.');
    }

    const binaryPath = ffmpegBinaryPath();
    if (!existsSync(binaryPath)) {
      throw new Error('The bundled FFmpeg binary is not available.');
    }

    mkdirSync(dirname(outputPath), { recursive: true });
    const jobId = randomUUID();
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'local-video-manager-render-'));
    const temporaryOutputPath = join(
      dirname(outputPath),
      `.${basename(outputPath)}.${jobId}.tmp.mp4`,
    );
    let overlayPath: string | null = null;
    if (request.overlayImageDataUrl) {
      overlayPath = join(temporaryDirectory, 'overlay.png');
      const encodedImage = request.overlayImageDataUrl.slice(
        request.overlayImageDataUrl.indexOf(',') + 1,
      );
      writeFileSync(overlayPath, Buffer.from(encodedImage, 'base64'));
    }

    removeFileIfPresent(temporaryOutputPath);
    const child = spawn(
      binaryPath,
      buildFfmpegArguments(inputPath, overlayPath, temporaryOutputPath, request),
      { windowsHide: true },
    );
    const activeRender: ActiveRender = {
      cancelled: false,
      child,
      durationMs: null,
      jobId,
      lastProgress: 0,
      outputPath,
      stderr: '',
      stdoutBuffer: '',
      temporaryDirectory,
      temporaryOutputPath,
    };
    this.activeRender = activeRender;
    this.emit(activeRender, onProgress, 'running', 0, null);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      activeRender.stderr = `${activeRender.stderr}${chunk}`.slice(-20_000);
      activeRender.durationMs ??= parseFfmpegDurationMs(activeRender.stderr);
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      activeRender.stdoutBuffer += chunk;
      const lines = activeRender.stdoutBuffer.split(/\r?\n/);
      activeRender.stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const progressMs = parseFfmpegProgressMs(line);
        if (progressMs === null || !activeRender.durationMs) {
          continue;
        }

        const progress = Math.min(
          99,
          Math.max(0, Math.floor((progressMs / activeRender.durationMs) * 100)),
        );
        if (progress > activeRender.lastProgress) {
          activeRender.lastProgress = progress;
          this.emit(activeRender, onProgress, 'running', progress, null);
        }
      }
    });

    let finalized = false;
    const finalize = (
      status: 'completed' | 'cancelled' | 'failed',
      errorMessage: string | null,
    ) => {
      if (finalized) {
        return;
      }
      finalized = true;

      let finalStatus = status;
      let finalError = errorMessage;
      if (status === 'completed') {
        try {
          moveRenderedFileIntoPlace(temporaryOutputPath, outputPath);
          this.completedOutputs.set(jobId, outputPath);
        } catch (error) {
          finalStatus = 'failed';
          finalError =
            error instanceof Error ? error.message : 'Failed to save the rendered video.';
        }
      }

      removeFileIfPresent(temporaryOutputPath);
      rmSync(temporaryDirectory, { recursive: true, force: true });
      if (this.activeRender?.jobId === jobId) {
        this.activeRender = null;
      }
      this.emit(
        activeRender,
        onProgress,
        finalStatus,
        finalStatus === 'completed' ? 100 : activeRender.lastProgress,
        finalError,
      );
    };

    child.once('error', (error) => finalize('failed', error.message));
    child.once('close', (code) => {
      if (activeRender.cancelled) {
        finalize('cancelled', null);
      } else if (code === 0 && existsSync(temporaryOutputPath)) {
        finalize('completed', null);
      } else {
        finalize('failed', failureMessage(activeRender.stderr));
      }
    });

    return jobId;
  }

  public cancel(jobId: string): void {
    if (!this.activeRender || this.activeRender.jobId !== jobId) {
      throw new Error('Video render job not found.');
    }

    this.activeRender.cancelled = true;
    this.activeRender.child.kill();
  }

  public getCompletedOutput(jobId: string): string {
    const outputPath = this.completedOutputs.get(jobId);
    if (!outputPath || !existsSync(outputPath)) {
      throw new Error('Rendered video not found.');
    }

    return outputPath;
  }

  public dispose(): void {
    if (!this.activeRender) {
      return;
    }

    this.activeRender.cancelled = true;
    this.activeRender.child.kill();
  }

  private emit(
    render: ActiveRender,
    listener: ProgressListener,
    status: VideoRenderProgress['status'],
    progress: number,
    errorMessage: string | null,
  ): void {
    listener({
      errorMessage,
      jobId: render.jobId,
      outputPath: render.outputPath,
      progress,
      status,
    });
  }
}
