import { describe, expect, it } from 'vitest';

import { explorerPauseReducer, INITIAL_PAUSE_STATE, isExplorerPaused, type PauseAction } from './pause';

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

  it('allows explicit resume while hovered/focused without immediately repausing', () => {
    expect(isExplorerPaused(apply('enter', 'focus', 'resume'))).toBe(false);
    expect(isExplorerPaused(apply('enter', 'focus', 'resume', 'focus'))).toBe(false);
    expect(isExplorerPaused(apply('enter', 'focus', 'resume', 'leave', 'blur', 'enter'))).toBe(true);
  });

  it('supports persistent manual pause, including on touch devices', () => {
    expect(isExplorerPaused(apply('pause'))).toBe(true);
    expect(isExplorerPaused(apply('pause', 'leave', 'blur'))).toBe(true);
    expect(isExplorerPaused(apply('pause', 'resume'))).toBe(false);
    expect(isExplorerPaused(apply('enter', 'resume', 'pause'))).toBe(true);
  });
});
