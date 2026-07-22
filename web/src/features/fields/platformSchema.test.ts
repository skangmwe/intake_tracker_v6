// Tests for the platform schema api wrappers (S34 Objects / Relationships tabs). apiFetch is mocked
// at the boundary; the URL each wrapper builds is what's under test.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import {
  fetchPlatformObjects,
  fetchPlatformRelationships,
  fetchPlatformWorkspaces,
} from './platformSchema';

jest.mock('@/shared/http/apiClient');
const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue([] as never);
});

describe('platformSchema api', () => {
  it('fetchPlatformObjects — calls the platform objects endpoint', async () => {
    // Act
    await fetchPlatformObjects();

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects', {});
  });

  it('fetchPlatformWorkspaces — calls the platform workspaces endpoint', async () => {
    // Act
    await fetchPlatformWorkspaces();

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/workspaces', {});
  });

  it('fetchPlatformRelationships — scopes the request to the workspace', async () => {
    // Act
    await fetchPlatformRelationships(WORKSPACE);

    // Assert
    const [url] = mockedApiFetch.mock.calls[0] ?? [];
    expect(url).toContain('/v1/platform/relationships');
    expect(url).toContain(`workspaceId=${WORKSPACE}`);
  });

  it('fetchPlatformObjects — forwards an abort signal when given', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchPlatformObjects(controller.signal);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects', {
      signal: controller.signal,
    });
  });
});
