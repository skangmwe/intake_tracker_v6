import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceFieldCatalogDto, WorkspaceId } from '@shared/types';

import { buildFieldCatalogRow, buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import * as relationshipsApi from '@/features/relationships/api';
import * as objectsApi from '@/features/objects/api';
import { FieldsAdminPage } from './FieldsAdminPage';

jest.mock('../api');
jest.mock('@/features/relationships/api');
jest.mock('@/features/objects/api');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedRelationshipsApi = relationshipsApi as jest.Mocked<typeof relationshipsApi>;
const mockedObjectsApi = objectsApi as jest.Mocked<typeof objectsApi>;

function catalog(): WorkspaceFieldCatalogDto {
  return {
    workspaceId: 'ws-1' as WorkspaceId,
    rows: [
      buildFieldCatalogRow({
        id: 'system:Request:recordId',
        fieldKey: 'recordId',
        displayName: 'Record ID',
        source: 'System',
        isReadOnly: true,
        location: 'Global',
      }),
      buildFieldCatalogRow({ id: 'fd-1', fieldKey: 'severity', displayName: 'Severity' }),
    ],
  };
}

const adminMe = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });

describe('FieldsAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchFieldCatalog.mockResolvedValue(catalog());
    mockedRelationshipsApi.fetchRelationships.mockResolvedValue([]);
    mockedObjectsApi.fetchObjects.mockResolvedValue([]);
  });

  it('FieldsAdminPage — not a workspace admin — shows a no-access message', async () => {
    const { container } = renderWithProviders(<FieldsAdminPage />, {
      seedMe: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
    });
    expect(await screen.findByText(/need to be a workspace admin/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsAdminPage — renders the flat field catalog table', async () => {
    const { container } = renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    // Object appears as a column, not an inner tab set.
    expect(screen.getByRole('columnheader', { name: /object/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsAdminPage — multiple admin workspaces — shows a workspace selector', async () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ level: 'WorkspaceAdmin', workspaceName: 'AI Solutions' }),
        buildMembership({
          level: 'WorkspaceAdmin',
          workspaceId: 'ws-2' as never,
          workspaceName: 'Litigation',
        }),
      ],
    });

    // Act
    renderWithProviders(<FieldsAdminPage />, { seedMe: me });
    await screen.findByRole('table');

    // Assert
    expect(screen.getByRole('combobox', { name: /workspace/i })).toBeInTheDocument();
  });

  it('FieldsAdminPage — Relationships tab shows the relationships admin surface', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('tab', { name: /relationships/i }));

    // Assert — "New relationship" belongs to the RelationshipsAdminTab; "New field" is gone.
    expect(await screen.findByRole('button', { name: /new relationship/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new field/i })).not.toBeInTheDocument();
  });

  it('FieldsAdminPage — Objects tab shows the objects admin surface', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('tab', { name: /objects/i }));

    // Assert
    expect(await screen.findByRole('button', { name: /new object/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new field/i })).not.toBeInTheDocument();
  });
});
