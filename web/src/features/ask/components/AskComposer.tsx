// The Ask input (Phase 4, ai-prompting-affordances.md + ai-streaming-and-perceived-latency.md). Suggested
// prompts seed the empty state; the input stays visible but disabled while streaming, and Send is replaced
// by Stop in the same position (muscle memory). Send is disabled until there's a question.

import { useState } from 'react';
import { PaperPlaneRight, Stop } from '@phosphor-icons/react';

import { AI_ASK_SUGGESTIONS } from '../constants';

interface AskComposerProps {
  isStreaming: boolean;
  showSuggestions: boolean;
  onAsk: (query: string) => void;
  onStop: () => void;
}

export function AskComposer({ isStreaming, showSuggestions, onAsk, onStop }: AskComposerProps) {
  const [value, setValue] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isStreaming || value.trim().length === 0) return;
    onAsk(value);
    setValue('');
  };

  return (
    <div className="ask-composer">
      {showSuggestions && (
        <div className="ask-suggestions">
          {AI_ASK_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="ask-suggestion"
              data-ds="chip"
              disabled={isStreaming}
              onClick={() => onAsk(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form className="ask-composer__row" onSubmit={submit}>
        <input
          className="mws-input ask-composer__input"
          type="text"
          aria-label="Ask a question about this workspace’s requests"
          placeholder="Ask about this workspace’s requests…"
          value={value}
          disabled={isStreaming}
          onChange={(event) => setValue(event.target.value)}
        />
        {isStreaming ? (
          <button type="button" className="mws-btn mws-btn--secondary" data-ds="btn" onClick={onStop}>
            <Stop size={18} weight="regular" aria-hidden /> Stop
          </button>
        ) : (
          <button type="submit" className="mws-btn mws-btn--primary" data-ds="btn" disabled={value.trim().length === 0}>
            <PaperPlaneRight size={18} weight="regular" aria-hidden /> Send
          </button>
        )}
      </form>
    </div>
  );
}
