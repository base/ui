'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { ExplorerHostMap } from '../hosts';

type ExplorerHostsContextValue = {
  hosts: ExplorerHostMap;
  origin: string;
};

const ExplorerHostsContext = createContext<ExplorerHostsContextValue>({
  hosts: {},
  origin: '',
});

export function ExplorerHostsProvider({
  hosts,
  origin,
  children,
}: ExplorerHostsContextValue & { children: ReactNode }) {
  return (
    <ExplorerHostsContext.Provider value={{ hosts, origin }}>{children}</ExplorerHostsContext.Provider>
  );
}

export function useExplorerHosts(): ExplorerHostsContextValue {
  return useContext(ExplorerHostsContext);
}
