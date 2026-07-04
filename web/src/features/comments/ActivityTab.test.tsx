// Component tests for the Activity tab (thread timeline + comment composer). Mocks the data hooks
// and the current-user hook; asserts the loading / error / empty states, the interleaved render, the
// @mention preview, and the post flow — each with a jest-axe assertion (web-testing.md).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ActivityThreadItem, CommentId, RecordId, UserId } from '@shared/types';

import { renderWithProviders, buildMe } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { ActivityTab } from './ActivityTab';
import { useThread, usePostComment } from './useComments';

jest.mock('@/features/users/useMe');
jest.mock('./useComments');

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseThread = useThread as jest.MockedFunction<typeof useThread>;
const mockedUsePost = usePostComment as jest.MockedFunction<typeof usePostComment>;

const RECORD_ID = 'AIS-00000001' as RecordId;
const me = buildMe();
const currentUserId = me.user.id;

function mockThread(state: Partial<ReturnType<typeof useThread>>) {
  mockedUseThread.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...state,
  } as unknown as ReturnType<typeof useThread>);
}

function mockPost(mutateAsync = jest.fn().mockResolvedValue(undefined), extra: Record<string, unknown> = {}) {
  mockedUsePost.mockReturnValue({ mutateAsync, isPending: false, isError: false, ...extra } as unknown as ReturnType<typeof usePostComment>);
  return mutateAsync;
}

beforeEach(() => {
  mockedUseMe.mockReturnValue({ data: me } as ReturnType<typeof useMe>);
  mockPost();
});

afterEach(() => jest.clearAllMocks());

describe('ActivityTab', () => {
  it('ActivityTab — loading — shows a loading status', () => {
    // Arrange
    mockThread({ isLoading: true });

    // Act
    renderWithProviders(<ActivityTab recordId={RECORD_ID} />);

    // Assert
    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
  });

  it('ActivityTab — error — shows an inline error alert', () => {
    // Arrange
    mockThread({ isError: true, error: new Error('boom') });

    // Act
    renderWithProviders(<ActivityTab recordId={RECORD_ID} />);

    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ActivityTab — empty thread — shows the empty message', async () => {
    // Arrange
    mockThread({ data: [] });

    // Act
    const { container } = renderWithProviders(<ActivityTab recordId={RECORD_ID} />);

    // Assert
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ActivityTab — interleaves a system event and a comment', async () => {
    // Arrange
    const thread: ActivityThreadItem[] = [
      { kind: 'event', event: { eventType: 'request.created', eventAt: '2026-07-01T09:00:00Z', summary: 'Request created' } },
      {
        kind: 'comment',
        comment: {
          id: 'c1' as CommentId,
          recordId: RECORD_ID,
          objectType: 'Request',
          authorUserId: currentUserId,
          body: 'Looks good @alice',
          mentionedUserIds: [],
          createdAt: '2026-07-01T11:00:00Z',
        },
      },
    ];
    mockThread({ data: thread });

    // Act
    const { container } = renderWithProviders(<ActivityTab recordId={RECORD_ID} />);

    // Assert — event summary + the caller's own comment both render on the timeline.
    expect(screen.getByText('Request created')).toBeInTheDocument();
    expect(screen.getByText('You commented')).toBeInTheDocument();
    expect(screen.getByText(/Looks good/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ActivityTab — typing an @mention shows the mention preview', async () => {
    // Arrange
    mockThread({ data: [] });

    // Act
    renderWithProviders(<ActivityTab recordId={RECORD_ID} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Ping @alice');

    // Assert
    expect(await screen.findByText('Mentions: @alice')).toBeInTheDocument();
  });

  it('ActivityTab — posting a comment calls the mutation with an empty mention list', async () => {
    // Arrange
    const mutateAsync = mockPost(jest.fn().mockResolvedValue(undefined));
    mockThread({ data: [] });

    // Act
    renderWithProviders(<ActivityTab recordId={RECORD_ID} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Nice work');
    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    // Assert — body is trimmed; mentionedUserIds is empty until a user directory lands (slice 12).
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ body: 'Nice work', mentionedUserIds: [] as UserId[] }),
    );
  });

  it('ActivityTab — the post button is disabled for an empty comment', () => {
    // Arrange
    mockThread({ data: [] });

    // Act
    renderWithProviders(<ActivityTab recordId={RECORD_ID} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });
});
