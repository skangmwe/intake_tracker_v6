// Field-value suggestion types (Phase 4, §14 drafting). Mirror FieldSuggestionController's DTOs. The server
// projects `fields` to the workspace content-field allowlist — the client sends only eligible sibling values,
// and the server is the authority on the data floor.

import type { WorkspaceId } from '@shared/types';

/** A proposed value for one field. `value` is null when the model has no confident suggestion. */
export interface FieldSuggestion {
  value: string | null;
  rationale: string;
}

/** Request body for POST ai/field-suggestion. */
export interface FieldSuggestionRequest {
  objectType: string;
  recordId?: string | null;
  targetFieldKey: string;
  fields: Record<string, string>;
  selectOptions?: string[] | null;
  provider?: string | null;
}

/**
 * What a call site passes to the shared FieldControl so it can offer suggestions: the workspace (for the
 * off-switch gate + endpoint), the object type, the record id (if editing an existing record), and the current
 * sibling field values keyed by field key. The Suggest control derives the target key + options from the field.
 */
export interface FieldSuggestContext {
  workspaceId: WorkspaceId;
  objectType: string;
  recordId?: string;
  siblingValues: Record<string, unknown>;
}
