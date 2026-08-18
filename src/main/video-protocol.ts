import { protocol } from 'electron';

import type { AppDatabase } from './database';
import { createVideoFileResponse } from './video-file-response';
import {
  parseVideoPlaybackUrl,
  resolveVideoPlaybackPath,
  VIDEO_PROTOCOL_SCHEME,
} from './video-playback';

export function registerVideoProtocol(
  database: AppDatabase,
  hasAppAccess: () => boolean,
): () => void {
  protocol.handle(VIDEO_PROTOCOL_SCHEME, async (request) => {
    if (!hasAppAccess()) {
      return new Response(null, { status: 403 });
    }

    const contentHash = parseVideoPlaybackUrl(request.url);
    if (!contentHash) {
      return new Response(null, { status: 400 });
    }

    const videoPath = await resolveVideoPlaybackPath(database, contentHash);
    if (!videoPath) {
      return new Response(null, { status: 404 });
    }

    return createVideoFileResponse(videoPath, request);
  });

  return () => protocol.unhandle(VIDEO_PROTOCOL_SCHEME);
}
