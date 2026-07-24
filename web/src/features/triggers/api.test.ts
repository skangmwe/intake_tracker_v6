// Unit tests for the triggers API module — verifies each call hits the right path/method/body.
// apiFetch is mocked at the HTTP boundary (web-testing.md — mock only at the boundary).

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { createTrigger, deleteTrigger, fetchTriggers, updateTrigger } from './api';
import type { TriggerUpsertRequest } from './types';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const WS = 'ws-1' as WorkspaceId;

const request: TriggerUpsertRequest = {
  name: 'SLA',
  isEnabled: false,
  cadence: 'Once',
  repeatIntervalDays: null,
  notificationCategory: 'sla-reminder',
  recipients: ['assignedAnalyst'],
  notificationTitle: 'Title',
  notificationBody: 'Body',
  conditions: [{ whenFieldKey: 'dueDate', comparator: 'lt', compareValue: '@today' }],
};

describe('triggers api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(undefined as never);
  });

  it('fetchTriggers — GETs the workspace triggers path', () => {
    fetchTriggers(WS);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/triggers', {});
  });

  it('fetchTriggers — passes the abort signal when provided', () => {
    const controller = new AbortController();
    fetchTriggers(WS, controller.signal);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/triggers', {
      signal: controller.signal,
    });
  });

  it('createTrigger — POSTs the request body', () => {
    createTrigger(WS, request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/triggers', {
      method: 'POST',
      body: request,
    });
  });

  it('updateTrigger — PUTs the keyed path', () => {
    updateTrigger(WS, 't-1', request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/triggers/t-1', {
      method: 'PUT',
      body: request,
    });
  });

  it('deleteTrigger — DELETEs the keyed path', () => {
    deleteTrigger(WS, 't-1');
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/triggers/t-1', {
      method: 'DELETE',
    });
  });
});
