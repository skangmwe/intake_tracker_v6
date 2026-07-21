import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FeatureListRow, PaginatedResponse, RecordId, UserId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { FeatureCatalogPage } from './FeatureCatalogPage';
import { useFeaturesList } from '../useFeatures';

jest.mock('@/features/users/useMe');
jest.mock('../useFeatures');
// The gallery layout's thumbnails fetch via the authenticated client; mock it so cards render placeholders.
jest.mock('@/shared/http/apiClient', () => ({ apiFetchBlob: jest.fn(() => Promise.resolve(new Blob())) }));
jest.mock('@/features/saved-views', () => ({
  useSavedViews: () => ({ data: [] }),
  toPickerView: (view: unknown) => view,
  SavedViewEditor: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseFeaturesList = useFeaturesList as jest.MockedFunction<typeof useFeaturesList>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

function buildFeatureRow(overrides: Partial<FeatureListRow> = {}): FeatureListRow {
  return {
    id: 'AIS-00000042' as RecordId,
    eTag: 'AAAAAAAAAAE=',
    name: 'Citation overlay',
    oneLiner: 'Highlights the source lines behind an answer',
    featureType: 'UI/visual',
    capabilityTags: ['citations'],
    techStack: ['React'],
    owner: 'Priya Raman' as UserId,
    maturity: 'Published',
    origin: 'AI Solutions',
    updatedAt: '2026-07-05T10:00:00Z',
    ...overrides,
  };
}

function page(
  items: FeatureListRow[],
  totalCount = items.length,
): PaginatedResponse<FeatureListRow> {
  return { items, totalCount, page: 1, pageSize: 25 };
}

interface ListState {
  data?: PaginatedResponse<FeatureListRow>;
  isLoading?: boolean;
  isError?: boolean;
}

function mockHooks(list: ListState) {
  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<
    typeof useMe
  >);
  mockedUseFeaturesList.mockReturnValue({
    data: list.data,
    isLoading: list.isLoading ?? false,
    isError: list.isError ?? false,
  } as ReturnType<typeof useFeaturesList>);
}

describe('FeatureCatalogPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('FeatureCatalogPage — renders a feature row with name, one-liner and maturity', async () => {
    // Arrange
    mockHooks({ data: page([buildFeatureRow()]) });

    // Act
    const { container } = renderWithProviders(<FeatureCatalogPage />, {
      route: '/feature-catalog',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Feature Catalog' })).toBeInTheDocument();
    expect(screen.getByText('Citation overlay')).toBeInTheDocument();
    expect(screen.getByText('Highlights the source lines behind an answer')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FeatureCatalogPage — switching to the Gallery layout renders feature cards (S11)', async () => {
    // Arrange
    mockHooks({ data: page([buildFeatureRow()]) });
    const user = userEvent.setup();
    renderWithProviders(<FeatureCatalogPage />, { route: '/feature-catalog' });

    // Act — toggle from Table to Gallery
    await user.click(screen.getByRole('button', { name: /Gallery/ }));

    // Assert — the feature renders as a gallery card and the gallery region is present
    expect(screen.getByRole('list', { name: 'Feature gallery' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Citation overlay/ })).toBeInTheDocument();
  });

  it('FeatureCatalogPage — the gallery hides the pager footer; the table keeps it', async () => {
    // Arrange
    mockHooks({ data: page([buildFeatureRow()], 60) });
    const user = userEvent.setup();
    renderWithProviders(<FeatureCatalogPage />, { route: '/feature-catalog' });

    // Assert — the table view (default) shows the footer
    expect(screen.getByText(/of 60 features/i)).toBeInTheDocument();

    // Act — switch to the gallery
    await user.click(screen.getByRole('button', { name: /Gallery/ }));

    // Assert — the gallery drops the pager (full-page scroll, load-all)
    expect(screen.queryByText(/of 60 features/i)).not.toBeInTheDocument();
  });

  it('FeatureCatalogPage — renders the loading state', () => {
    // Arrange
    mockHooks({ isLoading: true });

    // Act
    renderWithProviders(<FeatureCatalogPage />, { route: '/feature-catalog' });

    // Assert
    expect(screen.getByText('Loading features…')).toBeInTheDocument();
  });

  it('FeatureCatalogPage — an empty result under the default Published filter shows filtered-to-zero', async () => {
    // Arrange — the default "Published catalog" view carries a maturity filter, so an empty result
    // is a filtered-to-zero state (a bordered card + Clear filters), never the zero-data ceremony.
    mockHooks({ data: page([]) });

    // Act
    const { container } = renderWithProviders(<FeatureCatalogPage />, {
      route: '/feature-catalog',
    });

    // Assert — the shared EmptyListFilteredToZero (S42).
    expect(screen.getByText('No matches for these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FeatureCatalogPage — renders the error state', () => {
    // Arrange
    mockHooks({ isError: true });

    // Act
    renderWithProviders(<FeatureCatalogPage />, { route: '/feature-catalog' });

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('The catalog could not be loaded');
  });
});
