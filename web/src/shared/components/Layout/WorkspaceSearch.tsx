// Workspace search (top bar). SLICE-2 STUB: the input + results dropdown are present, but the
// real access-respecting search lands in slice 15 (replaces this stub's message with hits).

import { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';

import { useDismissable } from '@/shared/hooks/useDismissable';

export function WorkspaceSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLSpanElement>(open, () => setOpen(false));

  return (
    <span className="ast-search" ref={ref}>
      <MagnifyingGlass className="ast-search__icon" size={16} weight="regular" aria-hidden />
      <input
        type="text"
        className="ast-search__input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search this workspace"
        aria-label="Search this workspace"
      />
      {open && query.trim().length > 0 && (
        <div className="ast-search__menu" role="listbox" aria-label="Search results">
          <div className="ast-search__empty" role="option" aria-disabled="true" aria-selected={false}>
            Workspace search arrives in a later update.
          </div>
        </div>
      )}
    </span>
  );
}
