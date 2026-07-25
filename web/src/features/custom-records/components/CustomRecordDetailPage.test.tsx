// CustomRecordDetailPage — resolves the slug + record id, renders breadcrumb/header/meta and a
// data-driven fields panel, autosaves edits (full field map, debounced), and deletes via an inline
// confirm. Data hooks are mocked at the boundary; the page's own wiring is under test. Every rendered
// state carries a jest-axe assertion (web-testing.md).

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

import { CustomRecordDetailPage } from './CustomRecordDetailPage';
import {
  useCustomRecord,
  useDeleteCustomRecord,
  usePatchCustomRecord,
} from '../useCustomRecords';

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
const mockedUseRecord = useCustomRecord as jest.MockedFunction<typeof useCustomRecord>;
const mockedUsePatch = usePatchCustomRecord as jest.MockedFunction<typeof usePatchCustomRecord>;
const mockedUseDelete = useDeleteCustomRecord as jest.MockedFunction<typeof useDeleteCustomRecord>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });
const vendorObject = buildObjectDefinition({ id: 'obj-vendor', objectKey: 'vendor', name: 'Vendor', pluralLabel: 'Vendors' });

const schema: WorkspaceFieldSchemaDto = {
  workspaceId: me.memberships[0]!.workspaceId,
  objectType: 'Request',
  fields: [
    buildFieldDefinition({ fieldKey: 'tier', displayName: 'Tier', fieldType: 'SingleSelect', section: 'Details', sortOrder: 1, isRequired: false, options: [{ id: '1', value: 'silver', label: 'Silver', sortOrder: 0 }, { id: '2', value: 'gold', label: 'Gold', sortOrder: 1 }] }),
    buildFieldDefinition({ fieldKey: 'spend', displayName: 'Spend', fieldType: 'Number', section: 'Details', sortOrder: 2, isRequired: false }),
  ],
  platformFields: [],
};

const record: CustomRecordDto = {
  id: 'r-1',
  objectDefinitionId: 'obj-vendor',
  name: 'Acme',
  fields: { tier: 'silver', spend: 100 },
  createdAt: '2026-07-24T10:00:00Z',
  updatedAt: '2026-07-24T11:00:00Z',
  createdBy: 'user-1',
  eTag: 'v1',
};

const patchMutate = jest.fn();
const deleteMutateAsync = jest.fn();

interface PatchState { isPending?: boolean; isSuccess?: boolean }

function mockHooks(opts: { record?: { data?: CustomRecordDto; isLoading?: boolean; isError?: boolean }; patch?: PatchState } = {}) {
  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<typeof useMe>);
  mockedUseObjects.mockReturnValue({ data: [vendorObject], isLoading: false, isError: false } as ReturnType<typeof useWorkspaceObjects>);
  mockedUseFields.mockReturnValue({ data: schema, isLoading: false, isError: false } as ReturnType<typeof useWorkspaceFields>);
  mockedUseRecord.mockReturnValue({
    data: opts.record?.data ?? record,
    isLoading: opts.record?.isLoading ?? false,
    isError: opts.record?.isError ?? false,
  } as ReturnType<typeof useCustomRecord>);
  mockedUsePatch.mockReturnValue({ mutate: patchMutate, isPending: opts.patch?.isPending ?? false, isSuccess: opts.patch?.isSuccess ?? false, isError: false } as unknown as ReturnType<typeof usePatchCustomRecord>);
  mockedUseDelete.mockReturnValue({ mutateAsync: deleteMutateAsync, isPending: false, isError: false } as unknown as ReturnType<typeof useDeleteCustomRecord>);
}

function renderPage(route = '/objects/vendor/r-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/objects/:objectKey/:recordId" element={<CustomRecordDetailPage />} />
    </Routes>,
    { route },
  );
}

describe('CustomRecordDetailPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('CustomRecordDetailPage — renders breadcrumb, header, meta strip and the fields panel', async () => {
    // Arrange
    mockHooks();

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendors' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText('r-1')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tier (optional)' })).toHaveValue('silver');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordDetailPage — editing a field — autosaves the full field map and shows the saved indicator', async () => {
    // Arrange — patch reports success so the indicator can appear once an edit has happened.
    mockHooks({ patch: { isSuccess: true } });
    renderPage();

    // Act — change the Tier select.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tier (optional)' }), 'gold');

    // Assert — the debounced patch carries the whole field map (edited tier + untouched spend).
    await waitFor(() =>
      expect(patchMutate).toHaveBeenCalledWith({ name: 'Acme', fields: { tier: 'gold', spend: 100 } }),
    );
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('CustomRecordDetailPage — delete — confirms inline then deletes and returns to the list', async () => {
    // Arrange
    mockHooks();
    deleteMutateAsync.mockResolvedValue(undefined);
    renderPage();

    // Act — open the inline confirm, then confirm.
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete record' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete record' }));

    // Assert
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith('r-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/objects/vendor');
  });

  it('CustomRecordDetailPage — record load error — renders NoAccessPage (non-disclosure)', async () => {
    // Arrange — a forbidden / missing record.
    mockHooks({ record: { isError: true } });

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/don’t have access/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
