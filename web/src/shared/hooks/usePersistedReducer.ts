// usePersistedReducer — the shared hook for state that must survive a refresh
// (web-persistence.md). Scaffold state: signature only. Real IndexedDB-backed
// implementation lands with the first slice that needs it.

import { useReducer, type Dispatch, type Reducer } from 'react';

export function usePersistedReducer<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
  _persistenceKey: string,
): [S, Dispatch<A>] {
  // Scaffold: real IndexedDB hydration (via ./idb) + persist-on-dispatch lands with the first
  // slice that needs it (see file header); until then this behaves as a plain useReducer.
  return useReducer(reducer, initialState);
}
