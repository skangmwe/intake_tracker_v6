// CustomRecordCreatePage — resolves the slug to a custom object, renders a Name field plus a control
// per user field grouped by section, validates on submit, and creates + navigates. Data hooks are
// mocked at the boundary; the page's own wiring (validation, payload shape, navigation) is under test.
// Every rendered state carries a jest-axe assertion (web-testing.md).

import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { CustomRecordDto, WorkspaceFieldSchemaDto } from '@shared/types';

import {
  buildFieldDefinition,
  buildMe,
  buildMembership,
  buildObjectDefinition,
  renderWithProviders,
} from '@/test-utils';
import { useMe } from '@/features/users/useMe';
import { useWorkspaceObjects } from '@/features/objects';
import { useWorkspaceFields } from '@/features/fields';

import { CustomRecordCreatePage } from './CustomRecordCreatePage';
import { useCreateCustomRecord } from '../useCustomRecords';

jest.mock('@/features/users/useMe');
jest.mock('@/features/objects', () => ({ useWorkspaceObjects: jest.fn() }));
jest.mock('@/features/fields', () => ({ useWorkspaceFields: jest.fn() }));
jest.mock('../useCustomRecords');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseObjects = useWorkspaceObjects as jest.MockedFunction<typeof useWorkspaceObjects>;
const mockedUseFields = useWorkspaceFields as jest.MockedFunction<typeof useWorkspaceFields>;
const mockedUseCreate = useCreateCustomRecord as jest.MockedFunction<typeof useCreateCustomRecord>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });
const vendorObject = buildObjectDefinition({ id: 'obj-vendor', objectKey: 'vendor', name: 'Vendor', pluralLabel: 'Vendors' });

function schemaWith(fields: WorkspaceFieldSchemaDto['fields']): WorkspaceFieldSchemaDto {
  return { workspaceId: me.memberships[0]!.workspaceId, objectType: 'Request', fields, platformFields: [] };
}

const twoFieldSchema = schemaWith([
  buildFieldDefinition({ fieldKey: 'tier', displayName: 'Tier', fieldType: 'SingleSelect', section: 'Details', sortOrder: 1, isRequired: false, options: [{ id: '1', value: 'gold', label: 'Gold', sortOrder: 0 }] }),
  buildFieldDefinition({ fieldKey: 'spend', displayName: 'Spend', fieldType: 'Number', section: 'Details', sortOrder: 2, isRequired: false }),
]);

const mutateAsync = jest.fn();

function mockHooks(schema: WorkspaceFieldSchemaDto, objects: ReturnType<typeof buildObjectDefinition>[] = [vendorObject]) {
  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<typeof useMe>);
  mockedUseObjects.mockReturnValue({ data: objects, isLoading: false, isError: false } as ReturnType<typeof useWorkspaceObjects>);
  mockedUseFields.mockReturnValue({ data: schema, isLoading: false, isError: false } as ReturnType<typeof useWorkspaceFields>);
  mockedUseCreate.mockReturnValue({ mutateAsync, isPending: false, isError: false } as unknown as ReturnType<typeof useCreateCustomRecord>);
}

function renderPage(route = '/objects/vendor/new') {
  return renderWithProviders(
    <Routes>
      <Route path="/objects/:objectKey/new" element={<CustomRecordCreatePage />} />
    </Routes>,
    { route },
  );
}

describe('CustomRecordCreatePage', () => {
  afterEach(() => jest.clearAllMocks());

  it('CustomRecordCreatePage — renders a Name field and a control per user field grouped by section', async () => {
    // Arrange
    mockHooks(twoFieldSchema);

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('heading', { level: 1, name: 'New Vendor' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tier (optional)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Spend (optional)' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordCreatePage — unknown slug — renders NoAccessPage', async () => {
    // Arrange — slug resolves to no object.
    mockHooks(twoFieldSchema, []);

    // Act
    const { container } = renderPage('/objects/ghost/new');

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/don’t have access/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordCreatePage — required field empty on submit — shows the error and does not create', async () => {
    // Arrange — a required user field left empty; Name filled so only the field error fires.
    mockHooks(schemaWith([buildFieldDefinition({ fieldKey: 'code', displayName: 'Code', fieldType: 'ShortText', isRequired: true })]));
    renderPage();

    // Act
    await userEvent.type(screen.getByLabelText('Name'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Create record' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/Code is required/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('CustomRecordCreatePage — missing Name on submit — shows the Name error and does not create', async () => {
    // Arrange
    mockHooks(schemaWith([]));
    renderPage();

    // Act — submit with an empty Name.
    await userEvent.click(screen.getByRole('button', { name: 'Create record' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/Name is required/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('CustomRecordCreatePage — valid submit — creates with name + fields and navigates to the record', async () => {
    // Arrange
    mockHooks(twoFieldSchema);
    mutateAsync.mockResolvedValue({ id: 'r-new' } as unknown as CustomRecordDto);
    renderPage();

    // Act
    await userEvent.type(screen.getByLabelText('Name'), 'Acme');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tier (optional)' }), 'gold');
    await userEvent.click(screen.getByRole('button', { name: 'Create record' }));

    // Assert
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ name: 'Acme', fields: { tier: 'gold' } }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/objects/vendor/r-new');
  });

  it('CustomRecordCreatePage — object with zero user fields — submits with Name only', async () => {
    // Arrange
    mockHooks(schemaWith([]));
    mutateAsync.mockResolvedValue({ id: 'r-2' } as unknown as CustomRecordDto);
    renderPage();

    // Act
    await userEvent.type(screen.getByLabelText('Name'), 'Solo');
    await userEvent.click(screen.getByRole('button', { name: 'Create record' }));

    // Assert
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ name: 'Solo', fields: {} }));
    expect(mockNavigate).toHaveBeenCalledWith('/objects/vendor/r-2');
  });
});
