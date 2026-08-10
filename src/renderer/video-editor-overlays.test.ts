import { describe, expect, it } from 'vitest';

import { getOverlaySelectionAfterDelete } from './video-editor-overlays';

describe('getOverlaySelectionAfterDelete', () => {
  it('selects the previous overlay after deleting the last overlay', () => {
    expect(getOverlaySelectionAfterDelete(['1', '2', '3'], '3')).toBe('2');
  });

  it('selects the previous overlay after deleting a middle overlay', () => {
    expect(getOverlaySelectionAfterDelete(['1', '2', '3'], '2')).toBe('1');
  });

  it('selects the first remaining overlay after deleting the first overlay', () => {
    expect(getOverlaySelectionAfterDelete(['1', '2', '3'], '1')).toBe('2');
  });

  it('clears the selection after deleting the only overlay', () => {
    expect(getOverlaySelectionAfterDelete(['1'], '1')).toBeNull();
  });
});
