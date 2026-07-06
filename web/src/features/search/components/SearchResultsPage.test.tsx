// Tests for SearchResultsPage (S27) — prompt / too-short / loading / error / no-results / grouped
// results + pagination states, with jest-axe on each meaningful state. The feature api boundary is
// mocked; renderWithProviders seeds /users/me (so the active workspace resolves) and hosts the router
// at the requested ?q= route.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { PaginatedResponse, RecordId, SearchResultDto } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { SearchResultsPage } from './SearchResultsPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

const ME = buildMe({ memberships: [buildMembership()] });

function hit(overrides: Partial<SearchResultDto> = {}): SearchResultDto {
  return {
    recordId: 'AIS-00000001' as RecordId,
    name: 'Omega intake helper',
    stage: 'intake',
    origin: 'AI Solutions',
    matchKind: 'record',
    snippet: 'Omega threshold summary',
    ...overrides,
  };
}

function page(items: SearchResultDto[], totalCount = items.length): PaginatedResponse<SearchResultDto> {
  return { items, totalCount, page: 1, pageSize: 20 };
}

function renderAt(route: string) {
  return renderWithProviders(<SearchResultsPage />, { seedMe: ME, route });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('SearchResultsPage — no query — shows the search prompt and does not fetch', async () => {
  // Act
  const { container } = renderAt('/search');

  // Assert
  expect(screen.getByRole('heading', { name: 'Search your workspace' })).toBeInTheDocument();
  expect(mockedApi.searchFull).not.toHaveBeenCalled();
  expect(await axe(container)).toHaveNoViolations();
});

it('SearchResultsPage — query below the minimum length — shows the keep-typing hint', async () => {
  // Act
  const { container } = renderAt('/search?q=ab');

  // Assert
  expect(screen.getByRole('heading', { name: 'Keep typing' })).toBeInTheDocument();
  expect(mockedApi.searchFull).not.toHaveBeenCalled();
  expect(await axe(container)).toHaveNoViolations();
});

it('SearchResultsPage — loading — shows the searching status', () => {
  // Arrange — a pending query keeps the loading state.
  mockedApi.searchFull.mockReturnValue(new Promise(() => {}));

  // Act
  renderAt('/search?q=omega');

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent('Searching…');
});

it('SearchResultsPage — error — shows the error alert', async () => {
  // Arrange
  mockedApi.searchFull.mockRejectedValue(new Error('boom'));

  // Act
  renderAt('/search?q=omega');

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t run your search.');
});

it('SearchResultsPage — no results — shows the no-results state', async () => {
  // Arrange
  mockedApi.searchFull.mockResolvedValue(page([]));

  // Act
  const { container } = renderAt('/search?q=omega');

  // Assert
  expect(await screen.findByText('No results for “omega”')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('SearchResultsPage — grouped results — renders the record link, match kinds, and a highlighted snippet', async () => {
  // Arrange — two hits under one record (a record hit + a comment hit) and a second record.
  mockedApi.searchFull.mockResolvedValue(
    page([
      hit(),
      hit({ matchKind: 'comment', snippet: 'discussing the omega budget' }),
      hit({ recordId: 'AIS-00000002' as RecordId, name: 'Second omega record', matchKind: 'attachment', snippet: 'omega-spec.pdf' }),
    ]),
  );

  // Act
  const { container } = renderAt('/search?q=omega');

  // Assert
  const link = await screen.findByRole('link', { name: 'Omega intake helper' });
  expect(link).toHaveAttribute('href', '/requests/AIS-00000001');
  expect(screen.getByRole('link', { name: 'Second omega record' })).toHaveAttribute('href', '/requests/AIS-00000002');
  expect(screen.getAllByText('Record').length).toBeGreaterThan(0);
  expect(screen.getByText('Comment')).toBeInTheDocument();
  expect(screen.getByText('Attachment')).toBeInTheDocument();
  // The query term is highlighted client-side via <mark>, not injected as HTML.
  expect(container.querySelectorAll('mark.search-hit__mark').length).toBeGreaterThan(0);
  expect(await axe(container)).toHaveNoViolations();
});

it('SearchResultsPage — more than one page — shows the pager with Previous disabled on page 1', async () => {
  // Arrange — 25 total over a page size of 20 → two pages.
  mockedApi.searchFull.mockResolvedValue(page([hit()], 25));

  // Act
  renderAt('/search?q=omega');

  // Assert
  expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
});

it('SearchResultsPage — clicking Next — requests the second page', async () => {
  // Arrange — 25 total → two pages.
  const user = userEvent.setup();
  mockedApi.searchFull.mockResolvedValue(page([hit()], 25));
  renderAt('/search?q=omega');
  await screen.findByText('Page 1 of 2');

  // Act
  await user.click(screen.getByRole('button', { name: 'Next' }));

  // Assert — the query re-fires for page 2.
  await waitFor(() =>
    expect(mockedApi.searchFull).toHaveBeenCalledWith('ws-1', 'omega', 2, 20, expect.anything()),
  );
});
