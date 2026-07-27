// Top-bar workspace search (slice 15). A debounced records-only typeahead: up to 6 access-respecting
// hits in the caller's active workspace. Picking a hit opens the record; "See all results" (or Enter)
// opens the S27 results page. The query is scoped + access-gated server-side (BS §9.5). Replaces the
// slice-2 stub.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';

import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_QUERY_LENGTH } from '@/shared/constants';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useDismissable } from '@/shared/hooks/useDismissable';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';
import { useQuickSearch } from '@/features/search/useSearch';

export function WorkspaceSearch() {
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLSpanElement>(open, () => setOpen(false));

  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const { data: hits } = useQuickSearch(workspaceId ?? undefined, debounced);

  const trimmed = query.trim();
  const ready = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  const results = hits ?? [];

  const goToResults = () => {
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  };

  const openRecord = (recordId: string) => {
    navigate(`/requests/${recordId}`);
    setOpen(false);
    setQuery('');
  };

  return (
    <span className="ast-search" ref={ref}>
      <MagnifyingGlass className="ast-search__icon" size={16} weight="regular" aria-hidden />
      <input
        type="search"
        className="ast-search__input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            goToResults();
          }
        }}
        placeholder="Search this workspace"
        aria-label="Search this workspace"
        enterKeyHint="search"
      />
      {open && trimmed.length > 0 && (
        // A suggestions popover with an action (see-all) is not a single-select listbox — it is a
        // labelled group holding a list of navigational buttons + one action button. Modelling it as
        // listbox/option would violate aria-required-children (the action is not an option).
        <div className="ast-search__menu" role="group" aria-label="Search results">
          {!ready && (
            <p className="ast-search__empty">
              Type at least {SEARCH_MIN_QUERY_LENGTH} characters to search.
            </p>
          )}
          {ready && results.length === 0 && (
            <p className="ast-search__empty">No records match “{trimmed}”.</p>
          )}
          {ready && results.length > 0 && (
            <ul className="ast-search__list">
              {results.map((hit) => (
                <li key={hit.recordId}>
                  <button
                    type="button"
                    className="ast-search__option"
                    onClick={() => openRecord(hit.recordId)}
                  >
                    <span className="ast-search__option-name">{hit.name}</span>
                    <span className="ast-search__option-meta">
                      {hit.recordId}
                      {hit.stage ? ` · ${hit.stage}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ready && (
            <button type="button" className="ast-search__footer" onClick={goToResults}>
              See all results for “{trimmed}”
            </button>
          )}
        </div>
      )}
    </span>
  );
}
