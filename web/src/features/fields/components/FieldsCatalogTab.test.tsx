import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceFieldCatalogDto, WorkspaceFieldSchemaDto, WorkspaceId } from '@shared/types';

import {
  buildFieldCatalogRow,
  buildFieldDefinition,
  buildObjectDefinition,
  renderWithProviders,
} from '@/test-utils';
import { useWorkspaceObjects } from '@/features/objects';

import * as api from '../api';
import { FieldsCatalogTab } from './FieldsCatalogTab';

jest.mock('../api');
jest.mock('@/features/objects', () => ({ useWorkspaceObjects: jest.fn() }));

const mockedApi = api as jest.Mocked<typeof api>;
const mockedUseWorkspaceObjects = useWorkspaceObjects as jest.MockedFunction<
  typeof useWorkspaceObjects
>;
const WS = 'ws-1' as WorkspaceId;

function catalog(): WorkspaceFieldCatalogDto {
  return {
    workspaceId: WS,
    rows: [
      buildFieldCatalogRow({
        id: 'system:Request:recordId',
        fieldKey: 'recordId',
        displayName: 'Record ID',
        source: 'System',
        isReadOnly: true,
        location: 'Global',
        isRequired: true,
      }),
      buildFieldCatalogRow({
        id: 'fd-1',
        fieldKey: 'severity',
        displayName: 'Severity',
        source: 'User',
        objectType: 'Request',
      }),
    ],
  };
}

function schema(): WorkspaceFieldSchemaDto {
  return {
    workspaceId: WS,
    objectType: 'Request',
    fields: [
      buildFieldDefinition({
        fieldKey: 'severity',
        displayName: 'Severity',
        objectType: 'Request',
      }),
    ],
    platformFields: [],
  };
}

describe('FieldsCatalogTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchFieldCatalog.mockResolvedValue(catalog());
    mockedApi.fetchWorkspaceFields.mockResolvedValue(schema());
    mockedUseWorkspaceObjects.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useWorkspaceObjects>);
  });

  it('FieldsCatalogTab — renders the table and the count footer', async () => {
    const { container } = renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('2 field definitions')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsCatalogTab — New field opens the create editor', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /new field/i }));

    expect(await screen.findByRole('dialog', { name: 'Add field' })).toBeInTheDocument();
  });

  it('FieldsCatalogTab — New field with a custom object — shows it in the Object dropdown', async () => {
    mockedUseWorkspaceObjects.mockReturnValue({
      data: [buildObjectDefinition({ objectKey: 'vendor', name: 'Vendor', isSystem: false })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useWorkspaceObjects>);
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /new field/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Add field' });
    expect(await screen.findByRole('option', { name: 'Vendor' })).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsCatalogTab — clicking a system row opens the unified read-only sheet', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    await screen.findByRole('table');

    await user.click(screen.getByText('Record ID'));

    expect(await screen.findByRole('heading', { name: 'Edit Record ID' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/system field, provisioned automatically/i);
    // Exact match — the header's "Close editor" icon button also matches a loose /close/i regex.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save field/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldsCatalogTab — clicking an editable row loads and opens the editor', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    await screen.findByRole('table');

    await user.click(screen.getByText('Severity'));

    // The edit loader fetches the field's object schema, then the editor opens pre-filled.
    await waitFor(() =>
      expect(mockedApi.fetchWorkspaceFields).toHaveBeenCalledWith(WS, 'Request', expect.anything()),
    );
    expect(await screen.findByRole('dialog', { name: /edit severity/i })).toBeInTheDocument();
  });

  it('FieldsCatalogTab — create from the editor calls createField', async () => {
    mockedApi.createField.mockResolvedValue(
      buildFieldDefinition({ fieldKey: 'newField', displayName: 'New field' }),
    );
    const user = userEvent.setup();
    renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /new field/i }));
    await user.type(screen.getByLabelText('Display name'), 'New field');
    await user.type(screen.getByLabelText('Field key'), 'newField');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    await waitFor(() => expect(mockedApi.createField).toHaveBeenCalled());
  });

  it('FieldsCatalogTab — catalog error state', async () => {
    mockedApi.fetchFieldCatalog.mockRejectedValue(new Error('boom'));
    renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });
});
