// Filter bar for header-less list views (gallery, board). Table views host filtering in the
// column-header funnels; gallery/board have no column headers, so filtering moves here: an optional
// search box + the facet funnels rendered as labeled controls. Purely presentational — the surface
// owns the filter state and passes the search binding plus the already-rendered FilterFunnel nodes,
// so switching between table and gallery/board keeps exactly the same filters.

import type { ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';

import './GalleryFilterBar.css';

export interface GalleryFilterFacet {
  /** Stable key (the column key). */
  key: string;
  /** Visible facet label shown before its funnel. */
  label: string;
  /** The rendered FilterFunnel for this facet. */
  control: ReactNode;
}

export interface GalleryFilterSearch {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the search input. */
  label: string;
  placeholder?: string;
}

interface GalleryFilterBarProps {
  facets: GalleryFilterFacet[];
  /** Optional free-text search box shown to the left of the facets. */
  search?: GalleryFilterSearch;
  /** Accessible name for the group. */
  ariaLabel?: string;
}

export function GalleryFilterBar({ facets, search, ariaLabel = 'Filters' }: GalleryFilterBarProps) {
  return (
    <div className="gallery-filters" role="group" aria-label={ariaLabel}>
      {search && (
        <span className="gallery-filters__search">
          <MagnifyingGlass
            size={16}
            weight="regular"
            aria-hidden
            className="gallery-filters__search-icon"
          />
          <input
            type="search"
            className="gallery-filters__search-input"
            placeholder={search.placeholder}
            aria-label={search.label}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
          />
        </span>
      )}
      {facets.map((facet) => (
        <span key={facet.key} className="gallery-filters__facet">
          <span className="gallery-filters__facet-label">{facet.label}</span>
          {facet.control}
        </span>
      ))}
    </div>
  );
}
