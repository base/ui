export type PauseState = {
  hovered: boolean;
  focused: boolean;
  touching: boolean;
};
export type PauseAction = 'enter' | 'leave' | 'focus' | 'blur' | 'touch' | 'release';
export const INITIAL_PAUSE_STATE: PauseState = {
  hovered: false,
  focused: false,
  touching: false,
};

export function isExplorerPaused(state: PauseState): boolean {
  return state.hovered || state.focused || state.touching;
}

// A table is held only while it is being interacted with. There is no manual
// pause or sticky override; the other table continues to stream independently.
export function explorerPauseReducer(state: PauseState, action: PauseAction): PauseState {
  switch (action) {
    case 'enter': return { ...state, hovered: true };
    case 'focus': return { ...state, focused: true };
    case 'leave': return { ...state, hovered: false };
    case 'blur': return { ...state, focused: false };
    case 'touch': return { ...state, touching: true };
    case 'release': return { ...state, touching: false };
  }
}

export function pauseHint(state: PauseState): string {
  if (state.touching) return 'Paused while touching';
  if (state.hovered && state.focused) return 'Paused while interacting';
  if (state.focused) return 'Paused while focused';
  if (state.hovered) return 'Paused while hovering';
  return 'Hover to pause';
}
