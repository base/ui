import { describe, expect, it } from 'vitest';

import { navSlideDirection, SCROLL_FADE_MAX_PX, scrollEdges } from './nav-motion';

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

describe('scrollEdges', () => {
  it('returns no fade when content fits the viewport', () => {
    expect(scrollEdges(0, 200, 200)).toEqual({ top: 0, bottom: 0 });
    expect(scrollEdges(0, 180, 200)).toEqual({ top: 0, bottom: 0 });
  });

  it('grows the bottom fade to the cap at the start of an overflowing list', () => {
    expect(scrollEdges(0, 400, 200)).toEqual({ top: 0, bottom: SCROLL_FADE_MAX_PX });
  });

  it('grows the top fade with scrollTop until the cap', () => {
    expect(scrollEdges(16, 400, 200)).toEqual({ top: 16, bottom: 40 });
    expect(scrollEdges(80, 400, 200)).toEqual({ top: SCROLL_FADE_MAX_PX, bottom: SCROLL_FADE_MAX_PX });
  });

  it('shrinks the bottom fade as the end approaches', () => {
    expect(scrollEdges(180, 400, 200)).toEqual({ top: SCROLL_FADE_MAX_PX, bottom: 20 });
    expect(scrollEdges(200, 400, 200)).toEqual({ top: SCROLL_FADE_MAX_PX, bottom: 0 });
  });
});
