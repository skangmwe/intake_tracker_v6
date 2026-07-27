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

  it('FieldsAdminPage — active workspace is member-only — shows a no-access message', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<FieldsAdminPage />, {
      seedMe: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
    });

    // Assert
    expect(await screen.findByText(/need to be a workspace admin/i)).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsAdminPage — active workspace is admin — renders the flat field catalog table', async () => {
    const { container } = renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    // Object appears as a column, not an inner tab set.
    expect(screen.getByRole('columnheader', { name: /object/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
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
