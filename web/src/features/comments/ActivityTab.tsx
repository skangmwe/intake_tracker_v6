// S4/S5 Activity tab (slice 6). Renders the interleaved activity thread — comments + system events
// on the prototype's vertical timeline (icon + connector, title / meta / detail) — plus an immutable
// comment composer with a live @mention preview. Explicit loading / error / empty states
// (web-component-architecture.md). Comment bodies are Confidential — never logged.

import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChatCircle,
  Circle,
  FilePlus,
  PauseCircle,
  PencilSimple,
} from '@phosphor-icons/react';

import type { AuditEventItem, CommentDto, RecordId, UserId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextArea } from '@/shared/components/Form';
import { parseMentions } from '@/shared/text/mentions';
import { problemMessage } from '@/shared/http/problemMessage';
import { useMe } from '@/features/users/useMe';

import { useThread, usePostComment } from './useComments';
import './activity.css';

interface ActivityTabProps {
  recordId: RecordId;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Slice-6 actor display. A user directory lands with slice 12; until then names don't resolve. */
function actorLabel(userId: UserId | undefined, currentUserId: UserId | undefined): string {
  if (userId && currentUserId && userId === currentUserId) return 'You';
  return 'A teammate';
}

/**
 * Boundary-aware @mention matcher — same rule as `parseMentions` (start or a non-word, non-`@`
 * character before the handle, so email local-parts don't match). No lookbehind, for broad browser
 * support (web-browser-support.md).
 */
const MENTION_INLINE = /(^|[^\w@])(@[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9])/g;

/**
 * Render a comment body with @mentions emphasised. Non-mention text stays in contiguous runs (never
 * split per word) so it reads, selects, and copies as normal prose.
 */
function renderBody(body: string): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of body.matchAll(MENTION_INLINE)) {
    const [full, prefix, mention] = match;
    const start = match.index ?? 0;
    const before = body.slice(cursor, start) + prefix;
    if (before) {
      nodes.push(<span key={(key += 1)}>{before}</span>);
    }
    nodes.push(
      <span key={(key += 1)} className="activity-mention">
        {mention}
      </span>,
    );
    cursor = start + full.length;
  }
  const tail = body.slice(cursor);
  if (tail) {
    nodes.push(<span key={(key += 1)}>{tail}</span>);
  }
  return nodes.length > 0 ? nodes : body;
}

function eventIcon(eventType: string): ReactNode {
  switch (eventType) {
    case 'request.created':
      return <FilePlus size={20} aria-hidden />;
    case 'request.updated':
      return <PencilSimple size={20} aria-hidden />;
    case 'request.stage-changed':
      return <ArrowRight size={20} aria-hidden />;
    case 'request.hold-changed':
      return <PauseCircle size={20} aria-hidden />;
    default:
      return <Circle size={20} aria-hidden />;
  }
}

function CommentItem({ comment, currentUserId }: { comment: CommentDto; currentUserId: UserId | undefined }) {
  return (
    <li className="activity-item">
      <div className="activity-rail">
        <span className="activity-icon activity-icon--comment">
          <ChatCircle size={20} aria-hidden />
        </span>
        <span className="activity-connector" aria-hidden />
      </div>
      <div className="activity-body">
        <span className="activity-title">{actorLabel(comment.authorUserId, currentUserId)} commented</span>
        <span className="activity-meta">{formatWhen(comment.createdAt)}</span>
        <p className="activity-comment">{renderBody(comment.body)}</p>
      </div>
    </li>
  );
}

function EventItem({ event, currentUserId }: { event: AuditEventItem; currentUserId: UserId | undefined }) {
  const actor = event.actorUserId ? `${actorLabel(event.actorUserId, currentUserId)} · ` : '';
  return (
    <li className="activity-item">
      <div className="activity-rail">
        <span className="activity-icon">{eventIcon(event.eventType)}</span>
        <span className="activity-connector" aria-hidden />
      </div>
      <div className="activity-body">
        <span className="activity-title">{event.summary}</span>
        <span className="activity-meta">
          {actor}
          {formatWhen(event.eventAt)}
        </span>
      </div>
    </li>
  );
}

function Composer({ recordId }: { recordId: RecordId }) {
  const [body, setBody] = useState('');
  const post = usePostComment(recordId);
  const mentions = parseMentions(body);
  const canPost = body.trim().length > 0 && !post.isPending;

  const submit = async () => {
    if (!canPost) return;
    try {
      // mentionedUserIds is empty until a user directory lands (slice 12) to resolve @handles →
      // ids; the API's @mention fan-out path already consumes whatever ids are supplied.
      await post.mutateAsync({ body: body.trim(), mentionedUserIds: [] });
      setBody('');
    } catch {
      // Surfaced via the inline alert below (post.isError). No rethrow.
    }
  };

  return (
    <div className="activity-composer">
      <TextArea label="Add a comment" value={body} onChange={setBody} />
      {mentions.length > 0 && (
        <p className="activity-mentions-preview caption">
          Mentions: {mentions.map((handle) => `@${handle}`).join(', ')}
        </p>
      )}
      {post.isError && (
        <p className="mws-alert mws-alert--warning" role="alert">
          {problemMessage(post.error, 'Your comment could not be posted. Try again in a moment.')}
        </p>
      )}
      <div className="activity-composer__actions">
        <Button variant="primary" onClick={submit} disabled={!canPost}>
          Post comment
        </Button>
      </div>
    </div>
  );
}

export function ActivityTab({ recordId }: ActivityTabProps) {
  const { data: me } = useMe();
  const currentUserId = me?.user.id;
  const { data: thread, isLoading, isError, error } = useThread(recordId);

  return (
    <section className="activity" aria-label="Activity">
      <Composer recordId={recordId} />

      {isLoading && (
        <p className="caption" role="status">
          Loading activity…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(error, 'Activity could not be loaded. Try again in a moment.')}
        </p>
      )}

      {!isLoading && !isError && thread && thread.length === 0 && (
        <p className="activity-empty caption">No activity recorded yet.</p>
      )}

      {!isLoading && !isError && thread && thread.length > 0 && (
        <ol className="activity-thread">
          {thread.map((item, index) =>
            item.kind === 'comment' ? (
              <CommentItem key={`c-${item.comment.id}`} comment={item.comment} currentUserId={currentUserId} />
            ) : (
              <EventItem key={`e-${index}-${item.event.eventAt}`} event={item.event} currentUserId={currentUserId} />
            ),
          )}
        </ol>
      )}
    </section>
  );
}
