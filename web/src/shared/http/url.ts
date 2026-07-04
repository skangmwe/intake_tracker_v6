// Single shared utility for building request paths with query strings (web-coding-standards.md —
// never assemble query strings via manual template literals or repeated URLSearchParams in
// component/feature files). Undefined/null params are dropped; everything else is encoded.

export function withQuery(path: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.append(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
