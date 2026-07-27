// Tests for the platform schema api wrappers (S34 Objects / Relationships tabs). apiFetch is mocked
// at the boundary; the URL each wrapper builds is what's under test.

import { apiFetch } from '@/shared/http/apiClient';

import {
  createPlatformObject,
  createPlatformObjectField,
  deletePlatformObject,
  deletePlatformObjectField,
  fetchPlatformObjectFields,
  fetchPlatformObjects,
  fetchPlatformRelationships,
  updatePlatformObject,
  updatePlatformObjectField,
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

  // ─── Fields on a Global custom object (SP3b Slice 2a, Task 6) ────────────────────────────────

  it('fetchPlatformObjectFields — calls the object fields endpoint', async () => {
    // Act
    await fetchPlatformObjectFields('vendor');

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor/fields', {});
  });

  it('fetchPlatformObjectFields — forwards an abort signal when given', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchPlatformObjectFields('vendor', controller.signal);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor/fields', {
      signal: controller.signal,
    });
  });

  it('createPlatformObjectField — POSTs the request to the object fields endpoint', async () => {
    // Arrange
    const request = {
      objectType: 'vendor',
      fieldKey: 'priority',
      displayName: 'Priority',
      fieldType: 'ShortText' as const,
      category: 'WorkspaceLocal' as const,
    };

    // Act
    await createPlatformObjectField('vendor', request);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor/fields', {
      method: 'POST',
      body: request,
    });
  });

  it('updatePlatformObjectField — PATCHes the request to the field by key', async () => {
    // Arrange
    const request = {
      objectType: 'vendor',
      fieldKey: 'priority',
      displayName: 'Priority Level',
      fieldType: 'ShortText' as const,
      category: 'WorkspaceLocal' as const,
    };

    // Act
    await updatePlatformObjectField('vendor', 'priority', request);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor/fields/priority', {
      method: 'PATCH',
      body: request,
    });
  });

  it('deletePlatformObjectField — DELETEs the field by key', async () => {
    // Act
    await deletePlatformObjectField('vendor', 'priority');

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith('/v1/platform/objects/vendor/fields/priority', {
      method: 'DELETE',
    });
  });
});
