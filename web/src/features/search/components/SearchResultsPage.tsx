// S27 Search results — access-respecting full search across fields, comments, and attachment
// filenames in the caller's active workspace. Hits are grouped by record; each shows a match-kind
// badge and a highlighted snippet. The query + page live in the URL (?q=&page=) so results are
// back-button-able and shareable (disclosure-surfaces.md — a standalone task is a full route).
// Renders explicit loading / error / prompt / no-results states (web-component-architecture.md).

import { useMemo, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';

import type { SearchResultDto } from '@shared/types';

import { SEARCH_MIN_QUERY_LENGTH, SEARCH_RESULTS_PAGE_SIZE } from '@/shared/constants';
import { Button } from '@/shared/components/Button';
import { StatusPill } from '@/shared/components/Feedback/StatusPill';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';

import { splitSnippet } from '../highlight';
import { useFullSearch } from '../useSearch';
import '../search.css';

type MatchKind = SearchResultDto['matchKind'];

const MATCH_KIND_LABEL: Record<MatchKind, string> = {
  record: 'Record',
  comment: 'Comment',
  attachment: 'Attachment',
};

const MATCH_KIND_STATUS: Record<MatchKind, 'neutral' | 'info'> = {
  record: 'neutral',
  comment: 'info',
  attachment: 'info',
};

interface RecordGroup {
  recordId: string;
  name: string;
  stage: string | null;
  origin: string | null;
  hits: SearchResultDto[];
}

/** Group the page's flat hits by record, preserving the server's relevance order. */
function groupByRecord(rows: readonly SearchResultDto[]): RecordGroup[] {
  const groups: RecordGroup[] = [];
  const byId = new Map<string, RecordGroup>();
  for (const row of rows) {
    let group = byId.get(row.recordId);
    if (!group) {
      group = { recordId: row.recordId, name: row.name, stage: row.stage ?? null, origin: row.origin ?? null, hits: [] };
      byId.set(row.recordId, group);
      groups.push(group);
    }
    group.hits.push(row);
  }
  return groups;
}

function highlight(text: string, query: string): ReactNode {
  return splitSnippet(text, query).map((segment, index) =>
    segment.match ? <mark key={index} className="search-hit__mark">{segment.text}</mark> : <span key={index}>{segment.text}</span>,
  );
}

export function SearchResultsPage() {
  const workspaceId = useActiveWorkspaceId();

  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const trimmed = query.trim();
  const parsedPage = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const search = useFullSearch(workspaceId ?? undefined, query, page);
  const rows = search.data?.items ?? [];
  const groups = useMemo(() => groupByRecord(rows), [rows]);
  const total = search.data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SEARCH_RESULTS_PAGE_SIZE));

  const ready = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  const tooShort = trimmed.length > 0 && trimmed.length < SEARCH_MIN_QUERY_LENGTH;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    setParams(next ? { q: next, page: '1' } : {});
  };

  const goToPage = (next: number) => setParams({ q: query, page: String(next) });

  const rangeStart = total === 0 ? 0 : (page - 1) * SEARCH_RESULTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * SEARCH_RESULTS_PAGE_SIZE);

  return (
    <div className="search-page" data-layout="wide">
      <header className="search-page__header">
        <h1 className="h2">Search results</h1>
        <p className="body">Across records, comments, and attachment names in your workspace.</p>
        <form className="search-page__refine" role="search" onSubmit={onSubmit}>
          <label className="mws-sr-only" htmlFor="search-page-input">Search this workspace</label>
          <span className="search-page__input-wrap">
            <MagnifyingGlass className="search-page__input-icon" size={18} weight="regular" aria-hidden />
            <input
              id="search-page-input"
              key={query}
              name="q"
              type="search"
              defaultValue={query}
              className="search-page__input"
              placeholder="Search this workspace"
              enterKeyHint="search"
            />
          </span>
          <Button variant="secondary" type="submit">Search</Button>
        </form>
      </header>

      {!ready && (
        <section className="mws-empty mws-empty--zero" aria-labelledby="search-prompt">
          <h2 id="search-prompt" className="h3">{tooShort ? 'Keep typing' : 'Search your workspace'}</h2>
          <p className="body">
            {tooShort
              ? `Enter at least ${SEARCH_MIN_QUERY_LENGTH} characters to search.`
              : 'Find records, comments, and attachments. Type a term above to begin.'}
          </p>
        </section>
      )}

      {ready && search.isLoading && (
        <p className="caption" role="status">Searching…</p>
      )}

      {ready && search.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          We couldn’t run your search. Try again in a moment.
        </p>
      )}

      {ready && search.data && groups.length === 0 && (
        <section className="mws-empty mws-empty--filtered" aria-labelledby="search-none">
          <h2 id="search-none" className="h3">No results for “{trimmed}”</h2>
          <p className="body">Try a different term or check your spelling.</p>
        </section>
      )}

      {ready && groups.length > 0 && (
        <>
          <p className="caption search-page__count" role="status">
            Showing {rangeStart}–{rangeEnd} of {total} {total === 1 ? 'result' : 'results'}
          </p>
          <ul className="search-results">
            {groups.map((group) => (
              <li key={group.recordId} className="search-group" data-ds="card">
                <div className="search-group__head">
                  <Link className="search-group__title mws-link" to={`/requests/${group.recordId}`}>
                    {group.name}
                  </Link>
                  <span className="search-group__meta">
                    <span className="search-group__id">{group.recordId}</span>
                    {group.stage && <StatusPill status="neutral" label={group.stage} />}
                    {group.origin && <span className="caption">{group.origin}</span>}
                  </span>
                </div>
                <ul className="search-group__hits">
                  {group.hits.map((hit, index) => (
                    <li key={`${hit.matchKind}-${index}`} className="search-hit">
                      <StatusPill status={MATCH_KIND_STATUS[hit.matchKind]} label={MATCH_KIND_LABEL[hit.matchKind]} />
                      <span className="search-hit__snippet">{highlight(hit.snippet, query)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <nav className="search-page__pager" aria-label="Search results pages">
              <Button variant="secondary" compact disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span className="caption">Page {page} of {pageCount}</span>
              <Button variant="secondary" compact disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
