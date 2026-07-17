# 001 — Animate checkbox state transition

- **Status**: DONE
- **Commit**: b3235fc
- **Severity**: HIGH
- **Category**: Missed opportunity (state indication)
- **Estimated scope**: 1 file (`app/components/ui/Checkbox.tsx`), small

## Problem

The `Checkbox` component renders its checkmark via a conditional (`{checked && <svg>}`), so the mark blinks in and out with no transition. The box itself snaps between `border-black bg-black` and `border-bds-gray-20 bg-white` — also no transition. Every toggle on the snapshots custom component picker feels broken.

```tsx
/* app/components/ui/Checkbox.tsx:11-36 — current */
export function Checkbox({ checked, className }: CheckboxProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
        checked ? 'border-black bg-black' : 'border-bds-gray-20 bg-white',
        className,
      )}
    >
      {checked && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}
```

**Why it matters:** This is the primary interactive control on the snapshots configuration page. Users toggle components to build a custom snapshot — each toggle is a deliberate action that deserves clear state-indication feedback. The instant snap undermines confidence that the click registered.

## Target

1. The **box** transitions its `background-color` and `border-color` over 150ms with `ease-out`.
2. The **checkmark** is always rendered (not conditionally mounted). When unchecked it sits at `opacity: 0; transform: scale(0.75)`. When checked it transitions to `opacity: 1; transform: scale(1)` over 150ms `ease-out`. This follows the physicality rule — never `scale(0)`, enter from `0.75–0.97`.
3. All motion uses CSS transitions (not Motion/Framer) — the checkbox is a simple binary toggle, CSS retargets from current state on rapid clicks, and avoids pulling Motion into a tiny presentational component.
4. Under `prefers-reduced-motion: reduce`, movement (scale) is dropped but opacity feedback remains.

```tsx
/* target */
export function Checkbox({ checked, className }: CheckboxProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-[background-color,border-color] duration-150 ease-out',
        checked ? 'border-black bg-black' : 'border-bds-gray-20 bg-white',
        className,
      )}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          'transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
          checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
        )}
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
```

## Repo conventions to follow

- **Tailwind utility classes** for transitions and transforms — the codebase uses `transition-colors`, `duration-150`, `duration-300`, `ease-out` throughout (e.g. `app/snapshots/page.tsx:85` on the copy button: `transition-colors hover:text-black`).
- **`cn()` utility** (`app/components/ui/cn.ts`) for conditional class merging — already used in this component.
- **No new dependencies.** Tailwind's built-in `transition-*`, `duration-*`, `ease-*`, `scale-*`, `opacity-*` utilities cover everything needed.
- **`motion-reduce:` variant** — Tailwind's built-in `prefers-reduced-motion` variant. Already available in the Tailwind config, no setup required.

## Steps

1. **Remove the conditional render and always render the `<svg>`.** Delete the `{checked && (` wrapper and its closing `)}`. The SVG is now always in the DOM.

2. **Add transition classes to the outer `<span>`.** In the first argument to `cn()`, append `transition-[background-color,border-color] duration-150 ease-out` after the existing static classes. This transitions the box fill and border between checked/unchecked states.

3. **Add transition + state classes to the `<svg>`.** Add a `className` prop to the SVG with:
   ```
   cn(
     'transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
     checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
   )
   ```
   This fades and scales the checkmark in/out. Under `prefers-reduced-motion: reduce`, the `motion-reduce:transition-none` makes the state change instant (the scale change still applies as an end-state, but the transition is skipped — the user sees instant opacity+scale, no movement to track).

4. **Verify the full component matches the Target section above.** The final file should have no conditional render, two `cn()` calls (one on the span, one on the svg), and no other structural changes.

## Boundaries

- Do NOT touch any file other than `app/components/ui/Checkbox.tsx`.
- Do NOT change the component's props, API, or how callers use it.
- Do NOT add Motion/Framer imports — this uses pure CSS transitions via Tailwind.
- Do NOT add `scale-0` — use `scale-75` for the unchecked state (physicality rule).
- If the code at `app/components/ui/Checkbox.tsx` doesn't match the "current" excerpt above (drift since commit `b3235fc`), STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` — should pass with no errors.
  - `npx next build` — should succeed (no build regressions).
  - The snapshots page should render identically when all checkboxes are checked (no visual diff in static state).

- **Feel check**: Run the dev server (`npm run dev`), navigate to `/snapshots`, switch to "Custom" mode, and:
  1. Toggle a component checkbox. The box should smoothly fill black and the checkmark should scale+fade in over ~150ms. Unchecking should reverse smoothly.
  2. Rapidly spam-click a checkbox 5+ times. The transition should retarget from its current state each time — no jump to the start, no stuck intermediate state. (CSS transitions handle this natively.)
  3. In DevTools → Rendering → check "Emulate CSS media: prefers-reduced-motion: reduce". Toggle a checkbox — the state should change instantly (no visible scale/opacity animation) but the checkmark should still appear/disappear.
  4. In DevTools → Animations panel, set playback to 25%. Toggle a checkbox and confirm the checkmark scales from roughly 75% to 100% (not from 0%, not from 100% to 100%).

- **Done when**: Toggling any checkbox on the snapshots custom config shows a smooth 150ms fill + checkmark entrance/exit, rapid toggling never breaks, and reduced-motion users see instant state changes.
