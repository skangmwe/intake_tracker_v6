// Tests for the platform schema api wrappers (S34 Objects / Relationships tabs). apiFetch is mocked
// at the boundary; the URL each wrapper builds is what's under test.

import { apiFetch } from '@/shared/http/apiClient';

import {
  createPlatformObject,
  deletePlatformObject,
  fetchPlatformObjects,
  fetchPlatformRelationships,
  updatePlatformObject,
} from './platformSchema';

jest.mock('@/shared/http/apiClient');
const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

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

  it('fetchPlatformRelationships — calls the platform relationships endpoint', async () => {
    // Act
    await fetchPlatformRelationships();

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/relationships', {});
  });

  it('fetchPlatformRelationships — forwards an abort signal when given', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchPlatformRelationships(controller.signal);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/relationships', {
      signal: controller.signal,
    });
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

  it('createPlatformObject — POSTs the request to the platform objects endpoint', async () => {
    // Arrange
    const request = {
      name: 'Matter',
      pluralLabel: 'Matters',
      location: 'Global' as const,
      description: null,
      showInSidebar: true,
      sidebarCategory: null,
    };

    // Act
    await createPlatformObject(request);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects', {
      method: 'POST',
      body: request,
    });
  });

  it('updatePlatformObject — PATCHes the request to the object by id', async () => {
    // Arrange
    const request = { name: 'Matter 2' };

    // Act
    await updatePlatformObject('vendor', request);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor', {
      method: 'PATCH',
      body: request,
    });
  });

  it('deletePlatformObject — DELETEs the object by id', async () => {
    // Act
    await deletePlatformObject('vendor');

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor', {
      method: 'DELETE',
    });
  });
});
