// Ranked duplicate-matches panel (Phase 4, §14). Loads the caller-visible likely duplicates on demand and renders
// each with a title, a linguistic match-strength (never a numeric confidence score — ai-trust-and-provenance.md),
// an AI-labelled rationale, an open-link, and a "Mark as duplicate of this" action. Selecting one opens the
// confirm modal. All three non-data states (loading / empty / error) are rendered explicitly.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowSquareOut, Sparkle } from '@phosphor-icons/react';
import type { RecordId, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';

import { useDuplicateCheck } from '../useDuplicateCheck';
import type { DuplicateCandidate } from '../types';
import { ConfirmDuplicateModal } from './ConfirmDuplicateModal';

interface DuplicateMatchesPanelProps {
  workspaceId: WorkspaceId;
  recordId: RecordId;
  recordName: string;
  /** Close the panel — the record was marked a duplicate, or the user dismissed it. */
  onClose: () => void;
}

// Hybrid-score cut-off above which a match reads as "strong" rather than merely "possible". A presentation-only
// band for the linguistic label — the backend owns the retrieval threshold that decides what is a match at all.
const STRONG_MATCH_SCORE = 0.75;

/** Linguistic match strength from the hybrid score — order conveys the rest; no numeric confidence is shown. */
function matchStrength(score: number): string {
  return score >= STRONG_MATCH_SCORE ? 'Strong match' : 'Possible match';
}

export function DuplicateMatchesPanel({
  workspaceId,
  recordId,
  recordName,
  onClose,
}: DuplicateMatchesPanelProps) {
  const navigate = useNavigate();
  const query = useDuplicateCheck(workspaceId, recordId, true);
  const [selected, setSelected] = useState<DuplicateCandidate | null>(null);

  return (
    <section className="ai-duplicates__panel" aria-label="Likely duplicates">
      <span className="record-chip">Likely duplicates</span>

      {query.isPending && (
        <p className="ai-duplicates__status" role="status" aria-live="polite">
          <span className="ai-duplicates__dots" aria-hidden /> Checking for duplicates…
        </p>
      )}

      {query.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(query.error, 'The duplicate check could not run. Try again in a moment.')}
        </p>
      )}

      {query.isSuccess && query.data.length === 0 && (
        <p className="ai-duplicates__empty">No likely duplicates found.</p>
      )}

      {query.isSuccess && query.data.length > 0 && (
        <ul className="ai-duplicates__list">
          {query.data.map((candidate) => (
            <li key={candidate.recordId} className="ai-duplicates__match">
              <div className="ai-duplicates__match-head">
                <span className="ai-duplicates__match-title">{candidate.title}</span>
                <span className="ai-duplicates__strength">{matchStrength(candidate.score)}</span>
              </div>
              <p className="ai-duplicates__rationale" data-ds="ai">
                <span className="ai-duplicates__eyebrow">
                  <Sparkle size={14} weight="regular" aria-hidden /> AI
                </span>
                {candidate.rationale}
              </p>
              <div className="ai-duplicates__match-actions">
                <button
                  type="button"
                  className="ai-duplicates__open"
                  data-ds="btn"
                  onClick={() => navigate(`/requests/${candidate.recordId}`)}
                >
                  <ArrowSquareOut size={16} weight="regular" aria-hidden /> Open{' '}
                  {candidate.recordId}
                </button>
                <Button variant="secondary" compact onClick={() => setSelected(candidate)}>
                  Mark as duplicate of this
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="ai-duplicates__panel-actions">
        <Button variant="secondary" compact onClick={onClose}>
          Close
        </Button>
      </div>

      {selected && (
        <ConfirmDuplicateModal
          workspaceId={workspaceId}
          recordId={recordId}
          recordName={recordName}
          candidate={selected}
          onClose={() => setSelected(null)}
          onConfirmed={() => {
            setSelected(null);
            onClose();
          }}
        />
      )}
    </section>
  );
}
