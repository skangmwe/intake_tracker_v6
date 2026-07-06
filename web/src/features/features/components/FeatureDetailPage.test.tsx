import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FeatureDto, RecordId, UserId, WorkspaceId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { FeatureDetailPage } from './FeatureDetailPage';
import { useFeature, useSetFeatureMaturity } from '../useFeatures';

jest.mock('@/features/users/useMe');
jest.mock('../useFeatures');
jest.mock('@/features/attachments', () => ({ AttachmentsCard: () => <div>Attachments</div> }));
jest.mock('@/features/typed-links', () => ({ RelationshipsCard: () => <div>Relationships</div> }));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ recordId: 'AIS-00000042' }),
  useNavigate: () => jest.fn(),
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseFeature = useFeature as jest.MockedFunction<typeof useFeature>;
const mockedUseSetMaturity = useSetFeatureMaturity as jest.MockedFunction<
  typeof useSetFeatureMaturity
>;

const maturityMutate = jest.fn();

function buildFeature(overrides: Partial<FeatureDto> = {}): FeatureDto {
  return {
    id: 'AIS-00000042' as RecordId,
    workspaceId: 'ws-1' as WorkspaceId,
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
    createdBy: '00000000-0000-0000-0000-0000000000aa' as UserId,
    updatedBy: '00000000-0000-0000-0000-0000000000aa' as UserId,
    name: 'Citation overlay',
    oneLiner: 'Highlights the source lines behind an answer',
    whatItDoes: 'Draws highlight boxes over the cited lines',
    featureType: 'UI/visual',
    capabilityTags: ['citations'],
    solutionPattern: ['Extract'],
    techStack: ['React'],
    howToReuse: 'Lift the overlay component',
    repoUrl: 'https://example.test/repo',
    owner: 'Priya Raman' as UserId,
    maturity: 'Draft',
    complianceFlags: [],
    sourcedFromRecordIds: ['AIS-00000003' as RecordId],
    eTag: 'AAAAAAAAAAE=',
    ...overrides,
  };
}

function mockHooks(
  feature: FeatureDto | undefined,
  opts: { isLoading?: boolean; isError?: boolean } = {},
) {
  mockedUseMe.mockReturnValue({
    data: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
  } as ReturnType<typeof useMe>);
  mockedUseFeature.mockReturnValue({
    data: feature,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  } as ReturnType<typeof useFeature>);
  mockedUseSetMaturity.mockReturnValue({
    mutate: maturityMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSetFeatureMaturity>);
}

describe('FeatureDetailPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('FeatureDetailPage — renders grouped fields, provenance and no a11y violations', async () => {
    // Arrange
    mockHooks(buildFeature());

    // Act
    const { container } = renderWithProviders(<FeatureDetailPage />, {
      route: '/feature-catalog/AIS-00000042',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Citation overlay', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reuse & provenance' })).toBeInTheDocument();
    expect(screen.getByText('Relationships')).toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FeatureDetailPage — a Draft shows Publish, and publishing calls the mutation', async () => {
    // Arrange
    const user = userEvent.setup();
    mockHooks(buildFeature({ maturity: 'Draft' }));

    // Act
    renderWithProviders(<FeatureDetailPage />, { route: '/feature-catalog/AIS-00000042' });
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    // Assert
    expect(maturityMutate).toHaveBeenCalledWith('publish');
  });

  it('FeatureDetailPage — renders the error state when the feature is not loadable', () => {
    // Arrange
    mockHooks(undefined, { isError: true });

    // Act
    renderWithProviders(<FeatureDetailPage />, { route: '/feature-catalog/AIS-00000042' });

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't be loaded");
  });
});
