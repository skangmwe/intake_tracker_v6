// Behaviour + a11y tests for the triggers admin gating page. Covers the no-access, single-workspace,
// and multi-workspace-picker states. The triggers + fields apis are mocked; `me` is seeded so the
// shell renders without the network. axe runs on the no-access and admin states.

import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { WorkspaceFieldSchemaDto, WorkspaceId } from '@shared/types';

import { buildFieldDefinition, buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import * as fieldsApi from '@/features/fields/api';
import { TriggersAdminPage } from './TriggersAdminPage';

jest.mock('../api');
jest.mock('@/features/fields/api');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedFieldsApi = fieldsApi as jest.Mocked<typeof fieldsApi>;

const SCHEMA: WorkspaceFieldSchemaDto = {
  workspaceId: 'ws-1' as WorkspaceId,
  objectType: 'Request',
  fields: [buildFieldDefinition({ fieldKey: 'dueDate' })],
  platformFields: [],
};

const adminMe = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });

describe('TriggersAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchTriggers.mockResolvedValue([]);
    mockedFieldsApi.fetchWorkspaceFields.mockResolvedValue(SCHEMA);
  });

  it('not a workspace admin — shows a no-access message (no axe violations)', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<TriggersAdminPage />, {
      seedMe: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
    });

    // Assert
    expect(await screen.findByText(/need to be a workspace admin to manage triggers/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('single admin workspace — renders the list without a workspace picker (no axe violations)', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<TriggersAdminPage />, { seedMe: adminMe });

    // Assert
    expect(await screen.findByText(/no triggers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('multiple admin workspaces — shows the workspace picker', async () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ level: 'WorkspaceAdmin', workspaceName: 'AI Solutions' }),
        buildMembership({
          level: 'WorkspaceAdmin',
          workspaceId: 'ws-2' as WorkspaceId,
          workspaceName: 'Litigation',
        }),
      ],
    });

    // Act
    renderWithProviders(<TriggersAdminPage />, { seedMe: me });
    await screen.findByText(/no triggers yet/i);

    // Assert
    expect(screen.getByRole('combobox', { name: /workspace/i })).toBeInTheDocument();
  });
});
