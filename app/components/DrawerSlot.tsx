'use client';

import { createContext, useContext } from 'react';

// The mobile menu drawer's actions slot. Null while the drawer is closed, since
// the drawer only mounts its contents when open.
export const DrawerSlotContext = createContext<HTMLElement | null>(null);

export function useDrawerSlot() {
  return useContext(DrawerSlotContext);
}
