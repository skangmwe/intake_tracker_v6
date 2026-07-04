// The single @mention tokenizer (BS §11.2). Extracts `@handle` tokens from free text so the comment
// composer can highlight them and (when a user directory lands in a later slice) resolve them to
// notification targets. Kept in /shared so the composer today and the slice-12 fan-out later use one
// parser. Pure — no React, no side effects (web-file-structure.md).

/**
 * A mention handle: word characters, dots, hyphens; at least two chars. Must be preceded by
 * start-of-string or a non-word, non-`@` character so email local-parts (`name@host`) don't match.
 */
const MENTION_PATTERN = /(?:^|[^\w@])@([a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9])/g;

/**
 * Extract the distinct @mention handles from a body of text, in first-seen order, without the
 * leading `@`. Case is preserved; de-duplication is case-insensitive.
 */
export function parseMentions(text: string): string[] {
  if (!text) {
    return [];
  }

  const seen = new Set<string>();
  const handles: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const handle = match[1];
    if (!handle) {
      continue;
    }
    const key = handle.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      handles.push(handle);
    }
  }

  return handles;
}
