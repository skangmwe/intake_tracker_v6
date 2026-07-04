// Tests for the S4 Record detail page (non-escalated). Mocks the Requests hooks and the field-schema
// API so the component's own composition, autosave debounce, and 403 no-access surface are exercised
// without the network. Every rendered state carries a jest-axe assertion (web-testing.md).

import { Route, Routes } from 'react-router-dom';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RequestDto, WorkspaceFieldSchemaDto, WorkspaceId } from '@shared/types';

import { buildFieldDefinition, buildRequestDto, renderWithProviders } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';
import * as fieldsApi from '@/features/fields/api';

import * as useRequests from '../useRequests';
import { RecordDetailPage, SAVE_DEBOUNCE_MS } from './RecordDetailPage';

expect.extend(toHaveNoViolations);

jest.mock('../useRequests');
jest.mock('@/features/fields/api');

const patchMutate = jest.fn();
const setHoldMutate = jest.fn();
const setStageMutate = jest.fn();

const SCHEMA: WorkspaceFieldSchemaDto = {
  workspaceId: 'ws-1' as WorkspaceId,
  objectType: 'Request',
  platformFields: [],
  fields: [
    buildFieldDefinition({ fieldKey: 'name', displayName: 'Name', fieldType: 'ShortText', isRequired: true, sortOrder: 1 }),
    buildFieldDefinition({
      id: '00000000-0000-0000-0000-0000000000f2' as ReturnType<typeof buildFieldDefinition>['id'],
      fieldKey: 'description',
      displayName: 'Description',
      fieldType: 'LongText',
      isRequired: false,
      sortOrder: 2,
    }),
  ],
};

function queryResult(data: RequestDto) {
  return { data, isLoading: false, isError: false, error: null } as unknown as ReturnType<typeof useRequests.useRequest>;
}

function errorResult(error: unknown) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    error,
  } as unknown as ReturnType<typeof useRequests.useRequest>;
}

function asMutation(mutate: jest.Mock) {
  return { mutate, isError: false, isPending: false, error: null };
}

function seedDefaults() {
  jest.mocked(useRequests.useRequest).mockReturnValue(queryResult(buildRequestDto()));
  jest
    .mocked(useRequests.usePatchRequest)
    .mockReturnValue(asMutation(patchMutate) as unknown as ReturnType<typeof useRequests.usePatchRequest>);
  jest
    .mocked(useRequests.useSetHold)
    .mockReturnValue(asMutation(setHoldMutate) as unknown as ReturnType<typeof useRequests.useSetHold>);
  jest
    .mocked(useRequests.useSetStage)
    .mockReturnValue(asMutation(setStageMutate) as unknown as ReturnType<typeof useRequests.useSetStage>);
  jest.mocked(fieldsApi.fetchWorkspaceFields).mockResolvedValue(SCHEMA);
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/requests/:recordId" element={<RecordDetailPage />} />
    </Routes>,
    { route: '/requests/AIS-00000001' },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  seedDefaults();
});

describe('RecordDetailPage', () => {
  it('RecordDetailPage — renders the breadcrumb, name, four meta fields, stepper, and six tabs', async () => {
    // Arrange / Act
    const { container } = renderPage();

    // Assert
    expect(await screen.findByText('Meeting-notes action extraction')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.getByText('Display status')).toBeInTheDocument();
    expect(screen.getByText('Assigned analyst')).toBeInTheDocument();
    expect(screen.getByText('Priority score')).toBeInTheDocument();
    expect(screen.getByText('Due date')).toBeInTheDocument();
    expect(container.querySelector('[data-ds="stepper"]')).toBeInTheDocument();

    const tablist = screen.getByRole('tablist', { name: 'Record sections' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(6);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Intake tab renders editable fields seeded from the record', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue(
      queryResult(buildRequestDto({ fields: { name: 'Meeting notes', description: 'Existing summary' } })),
    );

    // Act
    const { container } = renderPage();

    // Assert
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Meeting notes');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — editing a field debounces one patch and shows the saved indicator', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue(
      queryResult(buildRequestDto({ fields: { name: 'Meeting notes' } })),
    );
    const { container } = renderPage();
    const nameInput = await screen.findByLabelText('Name');

    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Act
    await user.type(nameInput, '!');

    // Assert — not fired until the debounce elapses
    expect(patchMutate).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(patchMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();

    jest.useRealTimers();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Status tab: choosing On hold and updating calls setHold', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status override' }), 'On hold');
    await user.type(screen.getByLabelText('Reason'), 'Waiting on client');
    await user.click(screen.getByRole('button', { name: 'Update status' }));

    // Assert
    expect(setHoldMutate).toHaveBeenCalledWith({ held: true, reason: 'Waiting on client' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — loading — announces via role=status', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useRequests.useRequest>);

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading record…');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — a non-403 error renders the generic error alert', async () => {
    // Arrange — a 500 is not a forbidden case, so the no-access surface must not appear.
    jest.mocked(useRequests.useRequest).mockReturnValue(
      errorResult(new ApiError(500, { type: 'about:blank', title: 'Server error', status: 500, detail: 'Server exploded.' })),
    );

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Server exploded.');
    expect(screen.queryByText(/access to this record/i)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Status tab: Move stage calls setStage with the chosen stage', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Stage' }), 'build');
    await user.click(screen.getByRole('button', { name: 'Move stage' }));

    // Assert
    expect(setStageMutate).toHaveBeenCalledWith('build');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — Status tab: keeping Active clears the hold (held=false)', async () => {
    // Arrange — the record starts not held, so the default status choice is Active.
    const user = userEvent.setup();
    renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Status' }));
    await user.click(screen.getByRole('button', { name: 'Update status' }));

    // Assert — no reason text, so setHold is called with just { held: false }.
    expect(setHoldMutate).toHaveBeenCalledWith({ held: false });
  });

  it('RecordDetailPage — switching to a stub tab renders its placeholder', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderPage();

    // Act
    await user.click(await screen.findByRole('tab', { name: 'Attachments' }));

    // Assert
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RecordDetailPage — a 403 renders the no-access surface and hides the record name', async () => {
    // Arrange
    jest.mocked(useRequests.useRequest).mockReturnValue(
      errorResult(
        new ApiError(403, { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Forbidden.' }),
      ),
    );

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByText(/access to this record/i)).toBeInTheDocument();
    expect(screen.queryByText('Meeting-notes action extraction')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
