// Behaviour + a11y tests for the triggers admin gating page. Covers the not-admin and admin states,
// both scoped to the active workspace (from ActiveWorkspaceContext) rather than a per-page workspace
// picker. The triggers + fields apis are mocked; `me` is seeded so the shell renders without the
// network. axe runs on both states.

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

describe('TriggersAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchTriggers.mockResolvedValue([]);
    mockedFieldsApi.fetchWorkspaceFields.mockResolvedValue(SCHEMA);
  });

  it('active workspace is member-only — shows a no-access message (no axe violations)', async () => {
    // Arrange
    const seedMe = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

    // Act
    const { container } = renderWithProviders(<TriggersAdminPage />, { seedMe });

    // Assert
    expect(await screen.findByText(/need to be a workspace admin to manage triggers/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('active workspace is admin — renders the list without a workspace picker (no axe violations)', async () => {
    // Arrange
    const seedMe = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });

    // Act
    const { container } = renderWithProviders(<TriggersAdminPage />, { seedMe });

    // Assert
    expect(await screen.findByText(/no triggers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
