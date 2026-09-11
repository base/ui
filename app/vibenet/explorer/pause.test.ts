import { describe, expect, it } from 'vitest';

import { explorerPauseReducer, INITIAL_PAUSE_STATE, isExplorerPaused, pauseHint, type PauseAction } from './pause';

function apply(...actions: PauseAction[]) {
  return actions.reduce(explorerPauseReducer, INITIAL_PAUSE_STATE);
}

describe('explorer pause interactions', () => {
  it('pauses on hover and resumes on exit', () => {
    expect(isExplorerPaused(apply('enter'))).toBe(true);
    expect(isExplorerPaused(apply('enter', 'leave'))).toBe(false);
  });

  it('holds rows for keyboard focus until both pointer and focus leave', () => {
    expect(isExplorerPaused(apply('focus'))).toBe(true);
    expect(isExplorerPaused(apply('enter', 'focus', 'leave'))).toBe(true);
    expect(isExplorerPaused(apply('enter', 'focus', 'blur'))).toBe(true);
    expect(isExplorerPaused(apply('enter', 'focus', 'leave', 'blur'))).toBe(false);
  });

  it('holds rows during a touch and resumes on release or cancellation', () => {
    expect(isExplorerPaused(apply('touch'))).toBe(true);
    expect(isExplorerPaused(apply('touch', 'release'))).toBe(false);
    expect(isExplorerPaused(apply('touch', 'focus', 'release'))).toBe(true);
    expect(isExplorerPaused(apply('touch', 'focus', 'release', 'blur'))).toBe(false);
  });

  it('explains the active reason instead of just showing live/paused', () => {
    expect(pauseHint(apply())).toBe('Hover to pause');
    expect(pauseHint(apply('enter'))).toBe('Paused while hovering');
    expect(pauseHint(apply('focus'))).toBe('Paused while focused');
    expect(pauseHint(apply('touch'))).toBe('Paused while touching');
    expect(pauseHint(apply('focus', 'enter'))).toBe('Paused while interacting');
    expect(pauseHint(apply('focus', 'enter', 'leave', 'blur'))).toBe('Hover to pause');
  });
});
