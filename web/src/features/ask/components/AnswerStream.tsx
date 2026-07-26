// One assistant turn (Phase 4). Renders the streaming answer with inline citation chips and a blinking
// cursor while streaming, an AI-generated label (ai-trust-and-provenance.md), an honest in-place error,
// the cited-source list, and thumbs feedback once the turn is persisted (ai-feedback-and-correction.md).
// The streaming body is an aria-live region so screen readers hear the answer as it lands.

import type { ReactNode } from 'react';
import { Sparkle, ThumbsDown, ThumbsUp, WarningCircle } from '@phosphor-icons/react';

import type { AskCitation, AskTurn } from '../types';

import { CitationChip } from './CitationChip';
import { SourceList } from './SourceList';

interface AnswerStreamProps {
  turn: AskTurn;
  onRate: (rating: 'up' | 'down') => void;
}

const CITE_SEGMENT = /(\[cite:\d+\])/g;
const CITE_MARKER = /^\[cite:(\d+)\]$/;

function renderWithCitations(text: string, citations: AskCitation[]): ReactNode[] {
  const byMarker = new Map(citations.map((citation) => [citation.marker, citation]));
  return text.split(CITE_SEGMENT).map((segment, index) => {
    const match = CITE_MARKER.exec(segment);
    if (match) {
      const citation = byMarker.get(Number(match[1]));
      // Drop a marker with no matching source (hallucination guard already applied server-side).
      return citation ? <CitationChip key={`cite-${index}`} {...citation} /> : null;
    }
    return segment ? <span key={`text-${index}`}>{segment}</span> : null;
  });
}

export function AnswerStream({ turn, onRate }: AnswerStreamProps) {
  const canRate = !turn.isStreaming && !turn.error && Boolean(turn.messageId);

  return (
    <div className="ask-answer" data-ds="ai">
      <span className="ask-answer__label">
        <Sparkle size={16} weight="regular" aria-hidden />
        <span className="ask-answer__eyebrow">Generated</span>
      </span>

      <div className="ask-answer__body" aria-live="polite" aria-atomic="false">
        {renderWithCitations(turn.text, turn.citations)}
        {turn.isStreaming && <span className="ask-cursor" aria-hidden />}
      </div>

      {turn.error && (
        <p className="ask-answer__error" role="alert">
          <WarningCircle size={16} weight="regular" aria-hidden /> {turn.error}
        </p>
      )}

      <SourceList citations={turn.citations} />

      {canRate && (
        <div className="ask-feedback" role="group" aria-label="Rate this answer">
          <button
            type="button"
            className="ask-feedback__btn"
            data-selected={turn.feedback === 'up'}
            aria-label="Helpful"
            aria-pressed={turn.feedback === 'up'}
            onClick={() => onRate('up')}
          >
            <ThumbsUp size={18} weight="regular" aria-hidden />
          </button>
          <button
            type="button"
            className="ask-feedback__btn"
            data-selected={turn.feedback === 'down'}
            aria-label="Not helpful"
            aria-pressed={turn.feedback === 'down'}
            onClick={() => onRate('down')}
          >
            <ThumbsDown size={18} weight="regular" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
