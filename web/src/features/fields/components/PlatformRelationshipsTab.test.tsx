import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { PlatformWorkspaceDto, WorkspaceId } from '@shared/types';

import { buildRelationship, renderWithProviders } from '@/test-utils';

import * as api from '../platformSchema';
import { PlatformRelationshipsTab } from './PlatformRelationshipsTab';

jest.mock('../platformSchema');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACES: PlatformWorkspaceDto[] = [
  { id: 'ws-1' as WorkspaceId, name: 'AI Solutions', kind: 'ai-solutions' },
  { id: 'ws-2' as WorkspaceId, name: 'Litigation', kind: 'pg-dept' },
];

const RELATIONSHIPS = [
  buildRelationship({ id: 'r1' as never, name: 'Request has Tasks', isSystem: true, sortOrder: 0 }),
  buildRelationship({
    id: 'r2' as never,
    name: 'Custom link',
    isSystem: false,
    isRetired: true,
    sortOrder: 1,
  }),
];

describe('PlatformRelationshipsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchPlatformWorkspaces.mockResolvedValue(WORKSPACES);
    mockedApi.fetchPlatformRelationships.mockResolvedValue(RELATIONSHIPS);
  });

  it('PlatformRelationshipsTab — resolved — shows the picker and a read-only relationships table', async () => {
    // Act
    const { container } = renderWithProviders(<PlatformRelationshipsTab />);

    // Assert
    expect(await screen.findByRole('combobox', { name: /workspace/i })).toBeInTheDocument();
    expect(await screen.findByText('Request has Tasks')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    // Read-only — no create / retire affordances.
    expect(screen.queryByRole('button', { name: /new relationship/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retire/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformRelationshipsTab — picking another workspace re-scopes the list', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<PlatformRelationshipsTab />);
    await screen.findByRole('combobox', { name: /workspace/i });

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: /workspace/i }), 'ws-2');

    // Assert
    expect(mockedApi.fetchPlatformRelationships).toHaveBeenCalledWith('ws-2', expect.anything());
  });

  it('PlatformRelationshipsTab — while workspaces load — shows the loading state', async () => {
    mockedApi.fetchPlatformWorkspaces.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<PlatformRelationshipsTab />);
    expect(await screen.findByText(/loading workspaces/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformRelationshipsTab — workspace load failure — announces the error', async () => {
    mockedApi.fetchPlatformWorkspaces.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PlatformRelationshipsTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /workspace list could not be loaded/i,
    );
  });

  it('PlatformRelationshipsTab — no workspaces — shows the empty state', async () => {
    mockedApi.fetchPlatformWorkspaces.mockResolvedValue([]);
    renderWithProviders(<PlatformRelationshipsTab />);
    expect(await screen.findByText(/no workspaces to show relationships for/i)).toBeInTheDocument();
  });

  it('PlatformRelationshipsTab — while relationships load — shows the loading state', async () => {
    mockedApi.fetchPlatformRelationships.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<PlatformRelationshipsTab />);
    expect(await screen.findByText(/loading relationships/i)).toBeInTheDocument();
  });

  it('PlatformRelationshipsTab — relationships load failure — announces the error', async () => {
    mockedApi.fetchPlatformRelationships.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PlatformRelationshipsTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /relationships could not be loaded/i,
    );
  });

  it('PlatformRelationshipsTab — no relationships — shows the empty state', async () => {
    mockedApi.fetchPlatformRelationships.mockResolvedValue([]);
    renderWithProviders(<PlatformRelationshipsTab />);
    expect(await screen.findByText(/no relationships in this workspace/i)).toBeInTheDocument();
  });
});
