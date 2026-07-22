// Tests for ArchiveAnnouncementDialog (S23) — the archive confirmation. Covers the closed (null) state,
// the open confirmation naming the announcement, the confirm calling the retire api, the inline error,
// and axe. The dialog owns useRetireAnnouncement, so a local QueryClient hosts it and the api is mocked.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { WorkspaceId } from '@shared/types';

import * as api from '../api';
import { ArchiveAnnouncementDialog } from './ArchiveAnnouncementDialog';

expect.extend(toHaveNoViolations);
jest.mock('../api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const ANNOUNCEMENT = { id: 'a1', title: 'Q3 intake freeze' };

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderDialog(
  announcement: { id: string; title: string } | null,
  onClose: () => void = () => undefined,
) {
  return render(
    <ArchiveAnnouncementDialog
      announcement={announcement}
      workspaceId={WORKSPACE_ID}
      onClose={onClose}
    />,
    { wrapper: wrapper() },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('ArchiveAnnouncementDialog — no announcement — renders nothing', () => {
  // Act
  renderDialog(null);

  // Assert
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('ArchiveAnnouncementDialog — open — names the announcement and its consequence', async () => {
  // Act
  const { container } = renderDialog(ANNOUNCEMENT);

  // Assert
  expect(screen.getByText('Archive this announcement?')).toBeInTheDocument();
  expect(screen.getByText('Q3 intake freeze')).toBeInTheDocument();
  expect(screen.getByText(/removes/i)).toHaveTextContent(/bell|Home/);
  expect(screen.getByRole('button', { name: 'Archive announcement' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('ArchiveAnnouncementDialog — confirm — archives via the retire path then closes', async () => {
  // Arrange
  mockedApi.retireAnnouncement.mockResolvedValue({ id: 'a1', status: 'Archived' } as never);
  const onClose = jest.fn();
  const user = userEvent.setup();
  renderDialog(ANNOUNCEMENT, onClose);

  // Act
  await user.click(screen.getByRole('button', { name: 'Archive announcement' }));

  // Assert
  await waitFor(() => expect(mockedApi.retireAnnouncement).toHaveBeenCalledWith('a1'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('ArchiveAnnouncementDialog — cancel — closes without archiving', async () => {
  // Arrange
  const onClose = jest.fn();
  const user = userEvent.setup();
  renderDialog(ANNOUNCEMENT, onClose);

  // Act
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  // Assert
  expect(mockedApi.retireAnnouncement).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

it('ArchiveAnnouncementDialog — retire fails — surfaces an inline error', async () => {
  // Arrange
  mockedApi.retireAnnouncement.mockRejectedValue(new Error('boom'));
  const user = userEvent.setup();
  const { container } = renderDialog(ANNOUNCEMENT);

  // Act
  await user.click(screen.getByRole('button', { name: 'Archive announcement' }));

  // Assert
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
