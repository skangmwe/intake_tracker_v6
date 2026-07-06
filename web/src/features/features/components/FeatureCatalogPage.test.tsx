import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';

import type { FeatureListRow, PaginatedResponse, RecordId, UserId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { FeatureCatalogPage } from './FeatureCatalogPage';
import { useFeaturesList } from '../useFeatures';

jest.mock('@/features/users/useMe');
jest.mock('../useFeatures');
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

  it('FeatureCatalogPage — the Gallery view toggle is present but disabled (S11 deferred)', () => {
    // Arrange
    mockHooks({ data: page([buildFeatureRow()]) });

    // Act
    renderWithProviders(<FeatureCatalogPage />, { route: '/feature-catalog' });

    // Assert
    expect(screen.getByRole('button', { name: /Gallery view/ })).toBeDisabled();
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
