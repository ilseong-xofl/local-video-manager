import { describe, expect, it } from 'vitest';

import { rendererConfig } from './webpack.renderer.config';

describe('rendererConfig', () => {
  it('uses a CSP-compatible source map without eval', () => {
    expect(rendererConfig.devtool).toBe('source-map');
  });
});
