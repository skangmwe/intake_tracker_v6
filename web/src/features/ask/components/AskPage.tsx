// The Ask surface (Phase 4, §14). A grounded, permission-respecting search chatbot over the active
// workspace's requests. Resolves the workspace, gates on the AI-assist config (disabled → an explicit
// off state, never the chat), and renders the disclosure, the running turns, and the composer. Loading /
// error / disabled / empty / streaming / answered states are all rendered explicitly
// (web-component-architecture.md).

import { useAiConfig } from '@/features/ai-config';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';

import { useAskConversation } from '../askModel';

import { AnswerStream } from './AnswerStream';
import { AskComposer } from './AskComposer';
import { FirstUseDisclosure } from './FirstUseDisclosure';

import '../ask.css';

export function AskPage() {
  const workspaceId = useActiveWorkspaceId() ?? undefined;

  const { data: config, isLoading, isError } = useAiConfig(workspaceId);
  const { turns, isStreaming, ask, stop, rate } = useAskConversation(workspaceId);

  if (!workspaceId) {
    return (
      <section className="mws-empty mws-empty--zero" aria-label="Ask">
        <p className="body">Open a workspace to use Ask.</p>
      </section>
    );
  }

  if (isLoading && !config) {
    return (
      <p className="caption" role="status">
        Loading Ask…
      </p>
    );
  }

  if (isError && !config) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load Ask. Try again in a moment.
      </p>
    );
  }

  if (config && !config.enabled) {
    return (
      <section className="mws-empty mws-empty--zero" aria-label="Ask">
        <p className="body">
          AI assist is off for this workspace. Ask a workspace admin to turn it on in Admin → AI assist.
        </p>
      </section>
    );
  }

  return (
    <section className="ask" aria-label="Ask">
      <FirstUseDisclosure />

      <div className="ask__thread">
        {turns.length === 0 && (
          <p className="ask__intro body">
            Ask a question and I’ll answer from the requests you can see in this workspace, citing each source.
          </p>
        )}
        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="ask-user" data-role="user">
              <p className="body">{turn.text}</p>
            </div>
          ) : (
            <AnswerStream
              key={turn.id}
              turn={turn}
              onRate={(rating) => {
                if (turn.messageId) rate(turn.id, turn.messageId, rating);
              }}
            />
          ),
        )}
      </div>

      <AskComposer isStreaming={isStreaming} showSuggestions={turns.length === 0} onAsk={ask} onStop={stop} />
    </section>
  );
}
