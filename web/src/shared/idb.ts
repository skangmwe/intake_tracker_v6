// Low-level IndexedDB helpers — the primary client-side persistence store per
// web-persistence.md. localStorage is reserved for the theme-preference key only.
// Scaffold state: barrel exports the signatures. Implementation lands with the
// first slice that needs it (drafts, saved-view scratchpad, or a per-user pref).

export interface IdbHandle {
  put<T>(key: string, value: T): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<void>;
}

export async function openStore(_dbName: string, _storeName: string): Promise<IdbHandle> {
  throw new Error('idb.openStore is a scaffold stub; add real IndexedDB wiring in the slice that needs it.');
}
