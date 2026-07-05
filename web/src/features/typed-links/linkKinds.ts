// Link-kind vocabulary (BS §2.2) — shared labels for the Relationships card, the Link-a-record modal,
// and the Copy modal's link-back options. Enumerable UI options live in a typed module-level constant
// (web-coding-standards.md — never inline JSX option lists).

import type { TypedLinkKind } from '@shared/types';

export const LINK_KIND_LABELS: Record<TypedLinkKind, string> = {
  related: 'Related',
  'duplicate-of': 'Duplicate of',
  're-pursuit-of': 'Re-pursuit of',
  'sourced-from': 'Sourced from',
};

/** Kinds a user may create manually via the Relationships card. */
export const ADD_LINK_KINDS: TypedLinkKind[] = ['related', 'duplicate-of', 're-pursuit-of'];

export const ADD_LINK_KIND_OPTIONS = ADD_LINK_KINDS.map((kind) => ({ value: kind, label: LINK_KIND_LABELS[kind] }));
