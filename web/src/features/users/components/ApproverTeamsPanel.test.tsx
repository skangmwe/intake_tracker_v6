// ApproverTeamsPanel — the read-only approver-teams roster on S29. The workspace lifecycle config
// read is the panel's only dependency, so it is mocked at the @/features/lifecycle boundary and
// driven through its loading / error / empty / roster states. jest-axe runs against each state
// (web-testing.md accessibility requirement). The "Manage teams" link is asserted in the loaded state.

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';

import type { LifecycleConfigDto, UserId } from '@shared/types';

import { buildLifecycleConfig, buildMembership, renderWithProviders } from '@/test-utils';

import { useLifecycleConfig } from '@/features/lifecycle';

import { ApproverTeamsPanel } from './ApproverTeamsPanel';

jest.mock('@/features/lifecycle', () => ({ useLifecycleConfig: jest.fn() }));
const mockedConfig = useLifecycleConfig as jest.MockedFunction<typeof useLifecycleConfig>;

const workspaceId = buildMembership().workspaceId;

// The panel reads only data / isLoading / isError from the query result — a partial stub is enough.
// Cast is required because the real UseQueryResult union has ~20 discriminated members we don't set.
function queryStub(
  partial: Partial<UseQueryResult<LifecycleConfigDto>>,
): UseQueryResult<LifecycleConfigDto> {
  return partial as UseQueryResult<LifecycleConfigDto>;
}

beforeEach(() => jest.clearAllMocks());

describe('ApproverTeamsPanel', () => {
  it('ApproverTeamsPanel — config loading — shows the loading state', async () => {
    // Arrange
    mockedConfig.mockReturnValue(queryStub({ data: undefined, isLoading: true, isError: false }));

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByText(/loading approver teams/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — config errors — shows the error state', async () => {
    // Arrange
    mockedConfig.mockReturnValue(queryStub({ data: undefined, isLoading: false, isError: true }));

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/approver teams could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — no teams — shows the empty state and the manage link', async () => {
    // Arrange
    mockedConfig.mockReturnValue(
      queryStub({ data: buildLifecycleConfig({ approverTeams: [] }), isLoading: false, isError: false }),
    );

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByText(/no approver teams yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage teams/i })).toHaveAttribute('href', '/admin/lifecycle');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — team with no members — shows the per-team empty note', async () => {
    // Arrange
    mockedConfig.mockReturnValue(
      queryStub({
        data: buildLifecycleConfig({ approverTeams: [{ roleLabel: 'GCO', members: [] }] }),
        isLoading: false,
        isError: false,
      }),
    );

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByText('GCO')).toBeInTheDocument();
    expect(screen.getByText(/no members yet/i)).toBeInTheDocument();
    expect(screen.getByText('0 members')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — teams present — lists each role with its members and a manage link', async () => {
    // Arrange
    const config = buildLifecycleConfig({
      approverTeams: [
        {
          roleLabel: 'GCO',
          members: [{ userId: '00000000-0000-0000-0000-0000000000a1' as UserId, displayName: 'Ada Byron' }],
        },
      ],
    });
    mockedConfig.mockReturnValue(queryStub({ data: config, isLoading: false, isError: false }));

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByText('GCO')).toBeInTheDocument();
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('1 member')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage teams/i })).toHaveAttribute('href', '/admin/lifecycle');
    expect(await axe(container)).toHaveNoViolations();
  });
});
