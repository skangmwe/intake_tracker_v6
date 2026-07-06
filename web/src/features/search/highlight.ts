// Split a snippet into matched / unmatched segments so the UI can highlight the query terms without
// dangerouslySetInnerHTML (web-coding-standards.md — user/content text is never injected as HTML).
// The API returns snippets as plain text; highlighting is a client-side, render-only concern.

export interface SnippetSegment {
  text: string;
  match: boolean;
}

const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(token: string): string {
  return token.replace(REGEX_METACHARS, '\\$&');
}

/**
 * Break `text` into alternating plain / matched segments for the query's whitespace-separated tokens
 * (case-insensitive). Returns a single unmatched segment when there is nothing to highlight.
 */
export function splitSnippet(text: string, query: string): SnippetSegment[] {
  const value = text ?? '';
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (value === '' || tokens.length === 0) {
    return [{ text: value, match: false }];
  }

  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()));
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');

  // The capture-group split interleaves the matched substrings with the surrounding text; a part is a
  // highlight when it equals one of the tokens case-insensitively (no reliance on split position).
  return value
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: tokenSet.has(part.toLowerCase()) }));
}
