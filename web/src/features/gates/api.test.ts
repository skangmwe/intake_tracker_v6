// Unit tests for the gates API module. apiFetch is mocked at the HTTP boundary (web-testing.md).

import type { ApprovalDecisionRequest, RecordId, UserId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { fetchApprovalRequests, reRequestApproval, submitDecision } from './api';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const RECORD = 'AIS-00000001' as RecordId;

describe('gates api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchApprovalRequests — GETs the record gates and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([] as never);
    const controller = new AbortController();

    // Act
    await fetchApprovalRequests(RECORD, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${RECORD}/approval-requests`, { signal: controller.signal });
  });

  it('submitDecision — POSTs the decision to the approval request', () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);
    const request: ApprovalDecisionRequest = { slotIndex: 0, decidedByUserId: 'user-casey' as UserId, decision: 'Approved' };

    // Act
    submitDecision('gate-1', request);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/approval-requests/gate-1/decisions', { method: 'POST', body: request });
  });

  it('reRequestApproval — POSTs the slot index to re-request', () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);

    // Act
    reRequestApproval('gate-1', 2);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/approval-requests/gate-1/re-request', { method: 'POST', body: { slotIndex: 2 } });
  });
});
