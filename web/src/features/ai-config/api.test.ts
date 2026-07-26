// Unit tests for the ai-config api wrappers — assert the routes, methods, and bodies. The shared client is
// mocked so no network is touched.

import type { WorkspaceId } from '@shared/types';

import * as client from '@/shared/http/apiClient';

import { fetchAiConfig, updateAiConfig } from './api';

jest.mock('@/shared/http/apiClient');

const mocked = client as jest.Mocked<typeof client>;
const WS = 'ws-1' as WorkspaceId;

describe('ai-config api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchAiConfig — GETs the workspace config', async () => {
    // Arrange
    mocked.apiFetch.mockResolvedValue({ enabled: true, contentFieldAllowlist: ['Name'] });

    // Act
    const result = await fetchAiConfig(WS);

    // Assert
    expect(mocked.apiFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/config', {});
    expect(result.enabled).toBe(true);
  });

  it('fetchAiConfig — forwards an abort signal', async () => {
    // Arrange
    mocked.apiFetch.mockResolvedValue({ enabled: false, contentFieldAllowlist: [] });
    const controller = new AbortController();

    // Act
    await fetchAiConfig(WS, controller.signal);

    // Assert
    expect(mocked.apiFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/config', { signal: controller.signal });
  });

  it('updateAiConfig — PUTs the config body', async () => {
    // Arrange
    const body = { enabled: false, contentFieldAllowlist: ['Name', 'Description'] };
    mocked.apiFetch.mockResolvedValue(body);

    // Act
    await updateAiConfig(WS, body);

    // Assert
    expect(mocked.apiFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/config', { method: 'PUT', body });
  });
});
