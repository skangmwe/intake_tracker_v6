// Tests for the top-bar WorkspaceSearch (slice 15) — the debounced records typeahead: min-length
// hint, result options, no-match message, opening a record, and going to the full results page.
// jest-axe covers the idle + open states. The search api is mocked; useNavigate is stubbed to assert
// navigation; renderWithProviders seeds /users/me so the active workspace resolves.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as searchApi from '@/features/search/api';
import { WorkspaceSearch } from './WorkspaceSearch';

expect.extend(toHaveNoViolations);

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/features/search/api');
const mockedApi = searchApi as jest.Mocked<typeof searchApi>;

const ME = buildMe({ memberships: [buildMembership()] });

function renderSearch() {
  return renderWithProviders(<WorkspaceSearch />, { seedMe: ME });
}

function input() {
  return screen.getByRole('searchbox', { name: 'Search this workspace' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.searchRecords.mockResolvedValue([]);
});

it('WorkspaceSearch — renders a labelled search input', () => {
  // Act
  renderSearch();

  // Assert
  expect(input()).toBeInTheDocument();
});

it('WorkspaceSearch — query below the minimum length — shows the hint, does not fetch', async () => {
  // Arrange
  const user = userEvent.setup();
  renderSearch();

  // Act
  await user.type(input(), 'ab');

  // Assert
  expect(screen.getByText('Type at least 3 characters to search.')).toBeInTheDocument();
  expect(mockedApi.searchRecords).not.toHaveBeenCalled();
});

it('WorkspaceSearch — ready query with hits — lists options and the see-all footer', async () => {
  // Arrange
  const user = userEvent.setup();
  mockedApi.searchRecords.mockResolvedValue([
    { recordId: 'AIS-00000001' as RecordId, name: 'Contract helper', stage: 'intake', origin: 'AI Solutions' },
  ]);
  const { container } = renderSearch();

  // Act
  await user.type(input(), 'contract');

  // Assert
  const option = await screen.findByRole('button', { name: /Contract helper/ });
  expect(option).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /See all results/ })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspaceSearch — ready query with no hits — shows the no-match message', async () => {
  // Arrange
  const user = userEvent.setup();
  mockedApi.searchRecords.mockResolvedValue([]);
  renderSearch();

  // Act
  await user.type(input(), 'zzzquux');

  // Assert
  expect(await screen.findByText('No records match “zzzquux”.')).toBeInTheDocument();
});

it('WorkspaceSearch — clicking a result — navigates to the record', async () => {
  // Arrange
  const user = userEvent.setup();
  mockedApi.searchRecords.mockResolvedValue([
    { recordId: 'AIS-00000042' as RecordId, name: 'Billing report', stage: 'build', origin: 'AI Solutions' },
  ]);
  renderSearch();

  // Act
  await user.type(input(), 'billing');
  const option = await screen.findByRole('button', { name: /Billing report/ });
  await user.click(option);

  // Assert
  expect(mockNavigate).toHaveBeenCalledWith('/requests/AIS-00000042');
});

it('WorkspaceSearch — Enter — navigates to the full results page', async () => {
  // Arrange
  const user = userEvent.setup();
  renderSearch();

  // Act
  await user.type(input(), 'contract{Enter}');

  // Assert
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/search?q=contract'));
});

it('WorkspaceSearch — idle — has no axe violations', async () => {
  // Arrange / Act
  const { container } = renderSearch();

  // Assert
  expect(await axe(container)).toHaveNoViolations();
});
