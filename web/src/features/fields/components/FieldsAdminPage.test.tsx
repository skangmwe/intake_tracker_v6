import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceFieldSchemaDto, WorkspaceId } from '@shared/types';

import { buildFieldDefinition, buildMe, buildMembership, renderWithProviders } from '@/test-utils';

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

function schema(fieldCount: number): WorkspaceFieldSchemaDto {
  return {
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    fields: fieldCount > 0 ? [buildFieldDefinition()] : [],
    platformFields: [],
  };
}

const adminMe = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });

describe('FieldsAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchWorkspaceFields.mockResolvedValue(schema(1));
    mockedRelationshipsApi.fetchRelationships.mockResolvedValue([]);
    mockedObjectsApi.fetchObjects.mockResolvedValue([]);
  });

  it('FieldsAdminPage — not a workspace admin — shows a no-access message', async () => {
    const { container } = renderWithProviders(<FieldsAdminPage />, { seedMe: buildMe({ memberships: [buildMembership({ level: 'Member' })] }) });
    expect(await screen.findByText(/need to be a workspace admin/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsAdminPage — with fields — renders the field list', async () => {
    const { container } = renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsAdminPage — no fields for the object — shows the empty state', async () => {
    mockedApi.fetchWorkspaceFields.mockResolvedValue(schema(0));
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    expect(await screen.findByText(/no fields defined for request/i)).toBeInTheDocument();
  });

  it('FieldsAdminPage — Add field — opens the editor sheet', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('button', { name: /add field/i }));

    // Assert
    expect(await screen.findByRole('dialog', { name: 'Add field' })).toBeInTheDocument();
  });

  it('FieldsAdminPage — switching object type — refetches for that object', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('tab', { name: 'Task' }));

    // Assert — the query fires again with objectType Task.
    await waitFor(() =>
      expect(mockedApi.fetchWorkspaceFields).toHaveBeenCalledWith(expect.anything(), 'Task', expect.anything()),
    );
  });

  it('FieldsAdminPage — retire → confirm → calls retire endpoint', async () => {
    // Arrange
    mockedApi.retireField.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act — open the confirm, then confirm.
    await user.click(screen.getByRole('button', { name: /^retire$/i }));
    await user.click(screen.getByRole('button', { name: 'Retire field' }));

    // Assert
    await waitFor(() => expect(mockedApi.retireField).toHaveBeenCalledWith(expect.anything(), 'name', 'Request'));
  });

  it('FieldsAdminPage — retire → cancel — does not call the endpoint', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('button', { name: /^retire$/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(mockedApi.retireField).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retire field' })).not.toBeInTheDocument();
  });

  it('FieldsAdminPage — multiple admin workspaces — shows a workspace selector', async () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ level: 'WorkspaceAdmin', workspaceName: 'AI Solutions' }),
        buildMembership({ level: 'WorkspaceAdmin', workspaceId: 'ws-2' as never, workspaceName: 'Litigation' }),
      ],
    });

    // Act
    renderWithProviders(<FieldsAdminPage />, { seedMe: me });
    await screen.findByRole('table');

    // Assert
    expect(screen.getByRole('combobox', { name: /workspace/i })).toBeInTheDocument();
  });

  it('FieldsAdminPage — clicking the Relationships tab shows the relationships admin surface', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('tab', { name: /relationships/i }));

    // Assert — the "New relationship" button belongs to the RelationshipsAdminTab surface.
    expect(await screen.findByRole('button', { name: /new relationship/i })).toBeInTheDocument();
    // The Fields "Add field" primary button is hidden when the Relationships tab is active.
    expect(screen.queryByRole('button', { name: /add field/i })).not.toBeInTheDocument();
  });

  it('FieldsAdminPage — clicking the Objects tab shows the objects admin surface', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('tab', { name: /objects/i }));

    // Assert — the "New object" button belongs to the ObjectsAdminTab surface.
    expect(await screen.findByRole('button', { name: /new object/i })).toBeInTheDocument();
    // The Fields "Add field" primary button is hidden when the Objects tab is active.
    expect(screen.queryByRole('button', { name: /add field/i })).not.toBeInTheDocument();
  });

  it('FieldsAdminPage — save from the editor — calls the create endpoint', async () => {
    // Arrange
    mockedApi.createField.mockResolvedValue(buildFieldDefinition({ fieldKey: 'severity', displayName: 'Severity' }));
    const user = userEvent.setup();
    renderWithProviders(<FieldsAdminPage />, { seedMe: adminMe });
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('button', { name: /add field/i }));
    await user.type(screen.getByLabelText('Display name'), 'Severity');
    await user.type(screen.getByLabelText('Field key'), 'severity');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    await waitFor(() => expect(mockedApi.createField).toHaveBeenCalled());
  });
});
