// The content fields an admin may allow the AI layer to read — the fixed, closed non-PII set the server
// enforces (AiContentAllowlist.Allowed). Client / matter numbers and identities are absent by construction,
// so the UI can never offer them as content. A typed module constant, not inline JSX (web-component-architecture.md).

export interface AiContentField {
  /** The key stored in the allowlist — must match AiContentAllowlist.Allowed exactly. */
  key: string;
  label: string;
}

export const AI_CONTENT_FIELDS: readonly AiContentField[] = [
  { key: 'Name', label: 'Name' },
  { key: 'Description', label: 'Description' },
  { key: 'WorkflowDetails', label: 'Workflow details' },
];
