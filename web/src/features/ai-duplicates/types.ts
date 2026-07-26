// Duplicate-check types (Phase 4, §14). Mirror DuplicateCheckController's DTOs. The server enforces the
// off-switch, the permission boundary, and the data floor — the client never pre-filters or trusts local state.

/** A ranked likely-duplicate match with a one-line AI rationale. `score` drives ordering only. */
export interface DuplicateCandidate {
  recordId: string;
  title: string;
  score: number;
  rationale: string;
}

/** Request body for POST ai/duplicate-check/{recordId}/confirm. */
export interface ConfirmDuplicateRequest {
  duplicateOfRecordId: string;
  rationale: string;
}
