# search

Slice 15 — the S27 full Search results surface. (The top-bar quick search lives in the shell:
`shared/components/Layout/WorkspaceSearch.tsx`.)

- `api.ts` — `searchRecords` (GET quick, ≤6 hits) + `searchFull` (POST paginated, S27).
- `useSearch.ts` — `useQuickSearch` / `useFullSearch` TanStack Query hooks (fire once the query clears
  the 3-char floor).
- `highlight.ts` — `splitSnippet`, pure client-side highlight segmentation (no `dangerouslySetInnerHTML`).
- `components/SearchResultsPage.tsx` — S27: hits grouped by record, match-kind badges, highlighted
  snippets, pagination; query + page live in the URL (`?q=&page=`).

Access is enforced server-side (workspace-membership gate in the procs): a search returns only what
the caller can see, never a 403. Active workspace resolves via `shared/workspace/activeWorkspace.ts`.
