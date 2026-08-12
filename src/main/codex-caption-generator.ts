import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  VideoCaptionGenerationRequest,
  VideoCaptionGenerationResult,
} from '../shared/contracts';
import {
  buildVideoCaptionPrompt,
  parseGeneratedVideoCaption,
  parseGeneratedVideoScreenText,
} from './video-caption';

const CODEX_EXEC_TIMEOUT_MS = 180_000;
const CODEX_STDERR_MAX_LENGTH = 20_000;
const CAPTION_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    bottomText: { type: 'string', maxLength: 15 },
    caption: { type: 'string' },
    topText: { type: 'string', maxLength: 15 },
  },
  required: ['topText', 'bottomText', 'caption'],
  additionalProperties: false,
} as const;

export interface VideoCaptionGenerator {
  generate(request: VideoCaptionGenerationRequest): Promise<VideoCaptionGenerationResult>;
}

export type RunCodexExec = (prompt: string) => Promise<string>;

function appendStderr(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= CODEX_STDERR_MAX_LENGTH
    ? combined
    : combined.slice(-CODEX_STDERR_MAX_LENGTH);
}

function codexExecutable(): string {
  return process.env.LOCAL_VIDEO_MANAGER_CODEX_PATH?.trim() || 'codex';
}

function codexModelArguments(): string[] {
  const model = process.env.LOCAL_VIDEO_MANAGER_CODEX_MODEL?.trim();
  return model ? ['--model', model] : [];
}

async function runCodexProcess(
  prompt: string,
  workingDirectory: string,
  schemaPath: string,
  outputPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      codexExecutable(),
      [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '--color',
        'never',
        ...codexModelArguments(),
        '--output-schema',
        schemaPath,
        '--output-last-message',
        outputPath,
        '-',
      ],
      {
        cwd: workingDirectory,
        env: process.env,
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      },
    );
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, CODEX_EXEC_TIMEOUT_MS);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = appendStderr(stderr, chunk);
    });
    child.once('error', (error) => {
      const message =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'Codex CLI를 찾을 수 없습니다. LOCAL_VIDEO_MANAGER_CODEX_PATH를 확인하세요.'
          : `Codex CLI를 실행하지 못했습니다: ${error.message}`;
      finish(new Error(message));
    });
    child.once('close', (exitCode) => {
      if (timedOut) {
        finish(new Error('Codex 캡션 생성 시간이 3분을 초과했습니다.'));
        return;
      }
      if (exitCode !== 0) {
        const detail = stderr.trim();
        finish(
          new Error(
            detail
              ? `Codex 캡션 생성에 실패했습니다.\n${detail}`
              : `Codex 캡션 생성에 실패했습니다. 종료 코드: ${exitCode ?? 'unknown'}`,
          ),
        );
        return;
      }
      finish();
    });

    child.stdin.on('error', () => undefined);
    child.stdin.end(prompt);
  });
}

export async function executeCodexCaptionPrompt(prompt: string): Promise<string> {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'local-video-manager-caption-'));
  const schemaPath = join(workingDirectory, 'caption-output.schema.json');
  const outputPath = join(workingDirectory, 'caption-output.json');

  try {
    await writeFile(schemaPath, JSON.stringify(CAPTION_OUTPUT_SCHEMA), 'utf8');
    await runCodexProcess(prompt, workingDirectory, schemaPath, outputPath);
    return await readFile(outputPath, 'utf8');
  } finally {
    await rm(workingDirectory, { force: true, recursive: true });
  }
}

export function parseCodexCaptionResponse(response: string): VideoCaptionGenerationResult {
  let value: unknown;
  try {
    value = JSON.parse(response);
  } catch {
    throw new Error('Codex returned an invalid caption response.');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Codex returned an invalid caption response.');
  }

  const responseObject = value as Record<string, unknown>;
  const responseKeys = Object.keys(responseObject);
  if (
    responseKeys.length !== 3 ||
    responseKeys.some((key) => !['topText', 'bottomText', 'caption'].includes(key))
  ) {
    throw new Error('Codex returned an invalid caption response.');
  }
  return {
    bottomText: parseGeneratedVideoScreenText(responseObject.bottomText),
    caption: parseGeneratedVideoCaption(responseObject.caption),
    topText: parseGeneratedVideoScreenText(responseObject.topText),
  };
}

export class CodexExecVideoCaptionGenerator implements VideoCaptionGenerator {
  constructor(private readonly runCodexExec: RunCodexExec = executeCodexCaptionPrompt) {}

  async generate(request: VideoCaptionGenerationRequest): Promise<VideoCaptionGenerationResult> {
    const response = await this.runCodexExec(buildVideoCaptionPrompt(request));
    return parseCodexCaptionResponse(response);
  }
}
