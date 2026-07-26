// The ranked cited-source list beneath an answer (Phase 4, ai-trust-and-provenance.md). Each entry links to
// the record so the user can verify the claim. Renders nothing when the answer cited no source.

import { Link } from 'react-router-dom';

import type { AskCitation } from '../types';

export function SourceList({ citations }: { citations: AskCitation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="ask-sources">
      <p className="ask-sources__label">Sources</p>
      <ol className="ask-sources__list">
        {citations.map((citation) => (
          <li key={citation.marker}>
            <Link to={`/requests/${citation.recordId}`} className="ask-sources__link">
              [{citation.marker}] {citation.title}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
