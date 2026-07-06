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
  // FormData bodies (file uploads) must NOT get a Content-Type header — the browser sets the
  // multipart boundary itself — and must not be JSON-stringified.
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (hasBody && !isFormData) headers['Content-Type'] = 'application/json';
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;

  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers };
  if (hasBody) init.body = isFormData ? (opts.body as FormData) : JSON.stringify(opts.body);
  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(`/api${path}`, init);

  if (!res.ok) {
    throw await toApiError(res);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Fetch an authenticated binary response as a Blob (attachment downloads). A plain `<a href>` can't
 * carry the bearer token, so downloads go through fetch + the same token provider, then the caller
 * saves the returned Blob.
 */
export async function apiFetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { headers };
  if (signal) init.signal = signal;

  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    throw await toApiError(res);
  }

  return res.blob();
}

/**
 * POST a JSON body and read the binary response as a Blob (CSV export, slice 16). Like apiFetchBlob
 * but with a request body — a `<form>` POST can't carry the bearer token, so exports go through fetch
 * + the same token provider, then the caller saves the returned Blob.
 */
export async function apiFetchBlobPost(path: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method: 'POST', headers, body: JSON.stringify(body) };
  if (signal) init.signal = signal;

  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    throw await toApiError(res);
  }

  return res.blob();
}

async function toApiError(res: Response): Promise<ApiError> {
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

  return new ApiError(res.status, problem);
}
