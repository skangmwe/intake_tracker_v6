// Debounce a rapidly-changing value (e.g. a search input) — returns the value after it has been
// stable for `delayMs`. Named delays live in shared/constants.ts (web-coding-standards.md). The timer
// is cleared on change/unmount so a pending update never lands after the component is gone.

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
