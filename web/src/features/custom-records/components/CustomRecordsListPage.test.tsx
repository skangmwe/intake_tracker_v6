// CustomRecordsListPage — resolves the route slug to a custom object, builds columns from its schema,
// and renders every state explicitly. Data hooks are mocked at the boundary; the page's own wiring
// (state resolution, query assembly, navigation, edge states) is under test. Every rendered state
// carries a jest-axe assertion (web-testing.md).

import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type {
  CustomRecordListRow,
  ObjectDefinitionDto,
  PaginatedResponse,
  SavedViewDto,
  WorkspaceFieldSchemaDto,
} from '@shared/types';

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
import { useSavedViews } from '@/features/saved-views';

import { CustomRecordsListPage } from './CustomRecordsListPage';
import { useCustomRecordsList } from '../useCustomRecords';

jest.mock('@/features/users/useMe');
jest.mock('@/features/objects', () => ({ useWorkspaceObjects: jest.fn() }));
jest.mock('@/features/fields', () => ({ useWorkspaceFields: jest.fn() }));
jest.mock('../useCustomRecords');
jest.mock('@/features/saved-views', () => ({
  useSavedViews: jest.fn(() => ({ data: [] })),
  toPickerView: (view: { id: string; name: string; scope: string }) => view,
  SavedViewEditor: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseObjects = useWorkspaceObjects as jest.MockedFunction<typeof useWorkspaceObjects>;
const mockedUseFields = useWorkspaceFields as jest.MockedFunction<typeof useWorkspaceFields>;
const mockedUseRecords = useCustomRecordsList as jest.MockedFunction<typeof useCustomRecordsList>;
const mockedUseSavedViews = useSavedViews as jest.MockedFunction<typeof useSavedViews>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });
const vendorObject = buildObjectDefinition({
  id: 'obj-vendor',
  objectKey: 'vendor',
  name: 'Vendor',
  pluralLabel: 'Vendors',
});
const schema: WorkspaceFieldSchemaDto = {
  workspaceId: me.memberships[0]!.workspaceId,
  objectType: 'Request',
  fields: [
    buildFieldDefinition({ fieldKey: 'tier', displayName: 'Tier', fieldType: 'SingleSelect', sortOrder: 1, options: [{ id: '1', value: 'gold', label: 'Gold', sortOrder: 0 }] }),
    buildFieldDefinition({ fieldKey: 'spend', displayName: 'Spend', fieldType: 'Number', sortOrder: 2 }),
  ],
  platformFields: [],
};
const row: CustomRecordListRow = { id: 'r-1', name: 'Acme', fields: { tier: 'gold', spend: 100 }, eTag: 'v1' };

function page(items: CustomRecordListRow[], totalCount = items.length): PaginatedResponse<CustomRecordListRow> {
  return { items, totalCount, page: 1, pageSize: 25 };
}

interface State {
  objects?: { data?: ObjectDefinitionDto[]; isLoading?: boolean; isError?: boolean };
  schema?: { data?: WorkspaceFieldSchemaDto; isLoading?: boolean };
  records?: { data?: PaginatedResponse<CustomRecordListRow>; isLoading?: boolean; isError?: boolean };
  savedViews?: SavedViewDto[];
}

function mockHooks(state: State) {
  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<typeof useMe>);
  mockedUseObjects.mockReturnValue({
    data: state.objects?.data ?? [vendorObject],
    isLoading: state.objects?.isLoading ?? false,
    isError: state.objects?.isError ?? false,
  } as ReturnType<typeof useWorkspaceObjects>);
  mockedUseFields.mockReturnValue({
    data: state.schema?.data ?? schema,
    isLoading: state.schema?.isLoading ?? false,
  } as ReturnType<typeof useWorkspaceFields>);
  mockedUseRecords.mockReturnValue({
    data: state.records?.data,
    isLoading: state.records?.isLoading ?? false,
    isError: state.records?.isError ?? false,
  } as ReturnType<typeof useCustomRecordsList>);
  mockedUseSavedViews.mockReturnValue({ data: state.savedViews ?? [] } as ReturnType<typeof useSavedViews>);
}

function renderPage(route = '/objects/vendor') {
  return renderWithProviders(
    <Routes>
      <Route path="/objects/:objectKey" element={<CustomRecordsListPage />} />
    </Routes>,
    { route },
  );
}

describe('CustomRecordsListPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('CustomRecordsListPage — populated — renders the object title, columns and a row', async () => {
    // Arrange
    mockHooks({ records: { data: page([row]) } });

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('heading', { name: 'Vendors' })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Tier/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Acme' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordsListPage — unknown slug — renders NoAccessPage, not a 404 disclosure', async () => {
    // Arrange — the slug does not match any object the caller can see.
    mockHooks({ objects: { data: [] }, records: { data: page([]) } });

    // Act
    const { container } = renderPage('/objects/ghost');

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/don’t have access/i);
    expect(screen.queryByText(/ghost/i)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordsListPage — loading records — announces via role=status', async () => {
    // Arrange
    mockHooks({ records: { isLoading: true } });

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading records/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordsListPage — records error — announces via role=alert', async () => {
    // Arrange
    mockHooks({ records: { isError: true } });

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordsListPage — zero-data — offers Create your first record', async () => {
    // Arrange
    mockHooks({ records: { data: page([], 0) } });

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByText('No vendors yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your first record' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CustomRecordsListPage — filtered-to-zero — shows a Clear filters action', async () => {
    // Arrange — the record set is empty and a saved view carries a filter; selecting it makes the
    // list filtered-to-zero (the column funnels live in the table, which isn't rendered when empty,
    // so a saved view is the only filter entry point in the empty state).
    const filteredView = {
      id: 'sv-gold',
      name: 'Gold tier',
      scope: 'shared',
      isDefault: false,
      filters: { tier: { kind: 'select', values: ['gold'] } },
      sort: [],
    } as unknown as SavedViewDto;
    mockHooks({ records: { data: page([], 0) }, savedViews: [filteredView] });
    renderPage();

    // Act — open the saved-view picker and select the filtered view.
    await userEvent.click(screen.getByRole('button', { name: /All records/ }));
    await userEvent.click(screen.getByRole('button', { name: /Gold tier/ }));

    // Assert
    expect(screen.getByText('No matches for these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('CustomRecordsListPage — New record — navigates to the create route', async () => {
    // Arrange
    mockHooks({ records: { data: page([row]) } });
    renderPage();

    // Act
    await userEvent.click(screen.getByRole('button', { name: /New record/ }));

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith('/objects/vendor/new');
  });

  it('CustomRecordsListPage — row click — navigates to the record detail', async () => {
    // Arrange
    mockHooks({ records: { data: page([row]) } });
    renderPage();

    // Act
    await userEvent.click(screen.getByText('Acme'));

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith('/objects/vendor/r-1');
  });

  it('CustomRecordsListPage — a number filter — refetches with the clause in the query body', async () => {
    // Arrange
    mockHooks({ records: { data: page([row]) } });
    renderPage();

    // Act — open the Spend funnel and enter a comparator expression (single change; the controlled
    // funnel clears on intermediate invalid expressions, so char-by-char typing would reset it).
    await userEvent.click(screen.getByRole('button', { name: 'Filter Spend' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. >5 or =7'), { target: { value: '>3' } });

    // Assert — the last records query carried the parsed clause and an active pill summarises it.
    const calls = mockedUseRecords.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[2];
    expect(lastQuery?.filters?.spend).toEqual({ kind: 'number', op: '>', value: 3 });
    expect(screen.getByText('Spend > 3')).toBeInTheDocument();
  });
});
