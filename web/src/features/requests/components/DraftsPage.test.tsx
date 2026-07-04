import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DraftListRow } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { DraftsPage } from './DraftsPage';
import { useDeleteDraft, useDrafts } from '../useDrafts';

jest.mock('@/features/users/useMe');
jest.mock('../useDrafts');

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseDrafts = useDrafts as jest.MockedFunction<typeof useDrafts>;
const mockedUseDeleteDraft = useDeleteDraft as jest.MockedFunction<typeof useDeleteDraft>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

const draftRow: DraftListRow = {
  id: 'draft-1' as DraftListRow['id'],
  title: 'Meeting-notes action extraction',
  objectType: 'Request',
  lastEditedAt: '2026-07-03T12:00:00Z',
};

function mockHooks(drafts: DraftListRow[], mutate = jest.fn()) {
  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<typeof useMe>);
  mockedUseDrafts.mockReturnValue({ data: drafts, isLoading: false, isError: false } as ReturnType<typeof useDrafts>);
  mockedUseDeleteDraft.mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useDeleteDraft>);
}

describe('DraftsPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('DraftsPage — renders a row per draft with resume and discard', async () => {
    // Arrange
    mockHooks([draftRow]);

    // Act
    const { container } = renderWithProviders(<DraftsPage />, { route: '/drafts' });

    // Assert
    expect(screen.getByRole('heading', { name: 'Drafts' })).toBeInTheDocument();
    expect(screen.getByText('Meeting-notes action extraction')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DraftsPage — empty state when there are no drafts', async () => {
    // Arrange
    mockHooks([]);

    // Act
    const { container } = renderWithProviders(<DraftsPage />, { route: '/drafts' });

    // Assert
    expect(screen.getByText('No drafts yet.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DraftsPage — discard calls the delete mutation with the draft id', async () => {
    // Arrange
    const mutate = jest.fn();
    mockHooks([draftRow], mutate);

    // Act
    renderWithProviders(<DraftsPage />, { route: '/drafts' });
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    // Assert
    expect(mutate).toHaveBeenCalledWith('draft-1');
  });
});
