// An inline citation marker (Phase 4, ai-trust-and-provenance.md). A small superscript link to the cited
// record — the traceable source behind a claim. Uses the McDermott link style; navigates to the record.

import { Link } from 'react-router-dom';

import type { AskCitation } from '../types';

export function CitationChip({ marker, recordId, title }: AskCitation) {
  return (
    <Link
      to={`/requests/${recordId}`}
      className="ask-cite"
      data-ds="chip"
      aria-label={`Source ${marker}: ${title}`}
      title={title}
    >
      <sup>[{marker}]</sup>
    </Link>
  );
}
