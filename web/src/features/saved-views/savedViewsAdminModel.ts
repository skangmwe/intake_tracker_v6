// S32 Views & dashboards admin — pure helpers (web-component-architecture.md: testable logic out of
// the component). The PATCH /saved-views/{id} endpoint takes a full SavedViewUpsertRequest (it
// replaces the definition), so a scope/default change must resend the whole view with the one field
// changed. This maps a wire SavedViewDto back to an upsert request with an optional override.

import type { SavedViewDto, SavedViewUpsertRequest } from '@shared/types';

/** Rebuild the full upsert request from a view, optionally overriding scope / default. */
export function toUpsertRequest(
  view: SavedViewDto,
  override: Partial<Pick<SavedViewUpsertRequest, 'scope' | 'isDefault'>> = {},
): SavedViewUpsertRequest {
  return {
    objectType: view.objectType,
    name: view.name,
    scope: override.scope ?? view.scope,
    isDefault: override.isDefault ?? view.isDefault,
    columns: view.columns,
    filters: view.filters,
    sort: view.sort,
  };
}
