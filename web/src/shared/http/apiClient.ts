// Typed API client — wraps fetch with ProblemDetails parsing, ETag support, and Entra
// bearer-token attachment (web-state-management.md). The token provider is injected by the
// auth layer (setAuthTokenProvider); in dev mode it returns null and no Authorization header
// is sent — the API's matching dev-bypass accepts the request (api-auth.md).

import type { ProblemDetails } from '@shared/types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
  ) {
    super(problem.detail);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  ifMatch?: string;
  signal?: AbortSignal;
}

type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider = async () => null;

/** Injected by the auth layer so every request carries the caller's access token. */
export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const hasBody = opts.body !== undefined;

  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;

  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers };
  if (hasBody) init.body = JSON.stringify(opts.body);
  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(`/api${path}`, init);

  if (!res.ok) {
    let problem: ProblemDetails;
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      problem = {
        type: 'about:blank',
        title: res.statusText,
        status: res.status,
        detail: `Unexpected error (${res.status}).`,
      };
    }
    throw new ApiError(res.status, problem);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
