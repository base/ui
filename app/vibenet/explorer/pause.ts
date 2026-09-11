export type PauseState = {
  hovered: boolean;
  focused: boolean;
  manual: boolean;
  resumed: boolean;
};
export type PauseAction = 'enter' | 'leave' | 'focus' | 'blur' | 'pause' | 'resume';
export const INITIAL_PAUSE_STATE: PauseState = {
  hovered: false,
  focused: false,
  manual: false,
  resumed: false,
};

export function isExplorerPaused(state: PauseState): boolean {
  return state.manual || ((state.hovered || state.focused) && !state.resumed);
}

// Resume overrides hover/focus until the user leaves the region entirely, so
// clicking Resume does not immediately freeze the tables again. Manual pause
// persists on pointer exit and also makes the control usable on touch devices.
export function explorerPauseReducer(state: PauseState, action: PauseAction): PauseState {
  switch (action) {
    case 'enter': return { ...state, hovered: true };
    case 'focus': return { ...state, focused: true };
    case 'leave': return { ...state, hovered: false, resumed: state.focused && state.resumed };
    case 'blur': return { ...state, focused: false, resumed: state.hovered && state.resumed };
    case 'pause': return { ...state, manual: true, resumed: false };
    case 'resume': return { ...state, manual: false, resumed: true };
  }
}
