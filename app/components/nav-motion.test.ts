import { describe, expect, it } from 'vitest';

import { navSlideDirection } from './nav-motion';

describe('navSlideDirection', () => {
  it('slides forward when entering a section', () => {
    expect(navSlideDirection(null, '/vibenet')).toBe(1);
  });

  it('slides backward when leaving a section', () => {
    expect(navSlideDirection('/vibenet', null)).toBe(-1);
  });

  it('slides forward when moving between sections', () => {
    expect(navSlideDirection('/vibenet', '/benchmark')).toBe(1);
  });

  it('returns null when the parent is unchanged', () => {
    expect(navSlideDirection('/vibenet', '/vibenet')).toBeNull();
    expect(navSlideDirection(null, null)).toBeNull();
  });
});
