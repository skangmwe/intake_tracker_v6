// Tests for useRelationshipTabs (Slice 25) — the hook that filters workspace Relationships
// down to the config-driven tab-bar set for a given FromObjectType. The api boundary is
// mocked. Covers: null workspaceId short-circuits without a fetch, loaded rows filter to the
// tabs subset (showOnFromAsTab + fromObjectType match, retired excluded) and sort by
// sortOrder, error surfaces on the state, and abort cancels in-flight fetches.

import { act, renderHook, waitFor } from '@testing-library/react';

import type { WorkspaceId } from '@shared/types';

import { buildRelationship } from '@/test-utils';

import * as api from './api';
import { useRelationshipTabs } from './useRelationshipTabs';

jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WS = 'ws-1' as WorkspaceId;

describe('useRelationshipTabs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useRelationshipTabs — null workspaceId — does not fetch and returns empty', () => {
    // Arrange + Act
    const { result } = renderHook(() => useRelationshipTabs(null, 'Request'));

    // Assert
    expect(result.current.tabs).toEqual([]);
    expect(result.current.relationships).toEqual([]);
    expect(mockedApi.fetchRelationships).not.toHaveBeenCalled();
  });

  it('useRelationshipTabs — filters, sorts, and maps to the tab-bar set', async () => {
    // Arrange — a mix of matching / hidden / retired / wrong-object rows in reverse sort order.
    const tasksTab = buildRelationship({
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' as ReturnType<typeof buildRelationship>['id'],
      fromSideLabel: 'Tasks',
      tabLabel: 'Tasks',
      sortOrder: 10,
    });
    const attachmentsTab = buildRelationship({
      id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' as ReturnType<typeof buildRelationship>['id'],
      name: 'Request has Attachments',
      toObjectType: 'Feature',
      fromSideLabel: 'Attachments',
      tabLabel: 'Attachments',
      sortOrder: 0,
    });
    const hiddenRelationship = buildRelationship({
      id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc' as ReturnType<typeof buildRelationship>['id'],
      showOnFromAsTab: false,
      fromSideLabel: 'Related things',
    });
    const retiredTab = buildRelationship({
      id: 'dddddddd-dddd-4ddd-dddd-dddddddddddd' as ReturnType<typeof buildRelationship>['id'],
      isRetired: true,
      fromSideLabel: 'Old tab',
      tabLabel: 'Old tab',
    });
    const wrongObjectTab = buildRelationship({
      id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee' as ReturnType<typeof buildRelationship>['id'],
      fromObjectType: 'Task',
      fromSideLabel: 'Bundle members',
      tabLabel: 'Bundle members',
    });
    mockedApi.fetchRelationships.mockResolvedValue([
      tasksTab, attachmentsTab, hiddenRelationship, retiredTab, wrongObjectTab,
    ]);

    // Act
    const { result } = renderHook(() => useRelationshipTabs(WS, 'Request'));

    // Assert — only the two matching rows come through, sorted by sortOrder ascending.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tabs.map((tab) => tab.tabLabel)).toEqual(['Attachments', 'Tasks']);
    expect(result.current.relationships).toHaveLength(5);
    expect(result.current.error).toBeNull();
  });

  it('useRelationshipTabs — falls back to fromSideLabel when tabLabel is missing', async () => {
    // Arrange — an admin who ticked "Show as tab" but forgot to fill in Tab label.
    const labelless = buildRelationship({
      tabLabel: undefined,
      fromSideLabel: 'Tasks',
    });
    mockedApi.fetchRelationships.mockResolvedValue([labelless]);

    // Act
    const { result } = renderHook(() => useRelationshipTabs(WS, 'Request'));

    // Assert
    await waitFor(() => expect(result.current.tabs).toHaveLength(1));
    expect(result.current.tabs[0].tabLabel).toBe('Tasks');
  });

  it('useRelationshipTabs — fetch failure surfaces the error message', async () => {
    // Arrange
    mockedApi.fetchRelationships.mockRejectedValue(new Error('Boom.'));

    // Act
    const { result } = renderHook(() => useRelationshipTabs(WS, 'Request'));

    // Assert
    await waitFor(() => expect(result.current.error).toBe('Boom.'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tabs).toEqual([]);
  });

  it('useRelationshipTabs — unmount aborts the in-flight request', async () => {
    // Arrange — a request that never resolves so we can inspect the abort signal after unmount.
    let capturedSignal: AbortSignal | undefined;
    mockedApi.fetchRelationships.mockImplementation((_, signal) => {
      capturedSignal = signal;
      return new Promise(() => {
        /* never resolves */
      });
    });
    const { unmount } = renderHook(() => useRelationshipTabs(WS, 'Request'));

    // Act
    await act(async () => {
      unmount();
    });

    // Assert
    expect(capturedSignal?.aborted).toBe(true);
  });
});
