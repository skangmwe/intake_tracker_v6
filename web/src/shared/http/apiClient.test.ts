import { ApiError, apiFetch, setAuthTokenProvider } from './apiClient';

describe('apiFetch', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setAuthTokenProvider(async () => null);
  });

  function jsonResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'X',
      json: async () => body,
    } as unknown as Response;
  }

  it('apiFetch — 200 with body — returns parsed json and prefixes /api', async () => {
    // Arrange
    fetchMock.mockResolvedValue(jsonResponse(200, { hello: 'world' }));

    // Act
    const result = await apiFetch<{ hello: string }>('/v1/thing');

    // Assert
    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/thing', expect.objectContaining({ method: 'GET' }));
  });

  it('apiFetch — 204 — returns undefined without reading a body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);
    const result = await apiFetch<void>('/v1/thing', { method: 'POST', body: { a: 1 } });
    expect(result).toBeUndefined();
  });

  it('apiFetch — POST body — serialises JSON and sets Content-Type', async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);

    // Act
    await apiFetch<void>('/v1/thing', { method: 'POST', body: { theme: 'dark' } });

    // Assert
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ theme: 'dark' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('apiFetch — token provider set — attaches a bearer header', async () => {
    // Arrange
    setAuthTokenProvider(async () => 'token-abc');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    // Act
    await apiFetch('/v1/thing');

    // Assert
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('apiFetch — ifMatch — sets the If-Match header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/v1/thing', { ifMatch: 'etag-1' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['If-Match']).toBe('etag-1');
  });

  it('apiFetch — error with ProblemDetails — throws ApiError carrying it', async () => {
    // Arrange
    const problem = { type: 't', title: 'Nope', status: 403, detail: 'Access denied.' };
    fetchMock.mockResolvedValue(jsonResponse(403, problem));

    // Act + Assert
    await expect(apiFetch('/v1/thing')).rejects.toMatchObject({
      status: 403,
      problem: expect.objectContaining({ detail: 'Access denied.' }),
    });
  });

  it('apiFetch — error without JSON body — synthesises a ProblemDetails', async () => {
    // Arrange
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    // Act + Assert
    const error = await apiFetch('/v1/thing').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
  });
});
