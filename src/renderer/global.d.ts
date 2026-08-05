import type { LocalVideoManagerApi } from '../shared/contracts';

declare global {
  interface Window {
    localVideoManager: LocalVideoManagerApi;
  }
}

export {};
