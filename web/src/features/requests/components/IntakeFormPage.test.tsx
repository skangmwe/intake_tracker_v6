import { axe } from 'jest-axe';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FieldDefinitionDto, FieldRuleDto, SimilarRequestDto, WorkspaceFieldSchemaDto } from '@shared/types';

import {
  renderWithProviders,
  buildMe,
  buildMembership,
  buildFieldDefinition,
  buildLifecycleConfig,
  buildRequestDto,
} from '@/test-utils';
import { useMe } from '@/features/users/useMe';
import { fetchWorkspaceFields } from '@/features/fields/api';
import { useLifecycleConfig } from '@/features/lifecycle/useLifecycle';

import type { DraftDto } from '@shared/types';
import { ApiError } from '@/shared/http/apiClient';

import { IntakeFormPage } from './IntakeFormPage';
import * as requestsApi from '../api';
import { useCreateRequest, useSimilarRequests } from '../useRequests';
import { useSaveDraft } from '../useDrafts';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/features/users/useMe');
jest.mock('@/features/fields/api');
jest.mock('@/features/lifecycle/useLifecycle');
jest.mock('../useRequests');
jest.mock('../useDrafts');

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedFetchFields = fetchWorkspaceFields as jest.MockedFunction<typeof fetchWorkspaceFields>;
const mockedUseLifecycle = useLifecycleConfig as jest.MockedFunction<typeof useLifecycleConfig>;
const mockedUseCreate = useCreateRequest as jest.MockedFunction<typeof useCreateRequest>;
const mockedUseSaveDraft = useSaveDraft as jest.MockedFunction<typeof useSaveDraft>;
const mockedUseSimilar = useSimilarRequests as jest.MockedFunction<typeof useSimilarRequests>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

function optional(overrides: Partial<FieldDefinitionDto>): FieldDefinitionDto {
  return buildFieldDefinition({ isRequired: false, ...overrides });
}

const requireWhenClient: FieldRuleDto = {
  id: 'rule-client-number',
  action: 'Require',
  whenFieldKey: 'deptPgClient',
  comparator: 'eq',
  compareValue: 'Client',
  produceValue: null,
  sortOrder: 0,
};

const schema: WorkspaceFieldSchemaDto = {
  workspaceId: me.memberships[0]!.workspaceId,
  objectType: 'Request',
  platformFields: [],
  fields: [
    buildFieldDefinition({ fieldKey: 'name', displayName: 'Name', fieldType: 'ShortText', section: 'Intake', isRequired: true, sortOrder: 1 }),
    optional({ fieldKey: 'description', displayName: 'Description', fieldType: 'LongText', section: 'Intake', sortOrder: 2 }),
    optional({
      fieldKey: 'deptPgClient',
      displayName: 'Requestor type',
      fieldType: 'SingleSelect',
      section: 'Intake',
      sortOrder: 3,
      options: [
        { id: 'opt-dept', value: 'Dept', label: 'Department', sortOrder: 0 },
        { id: 'opt-pg', value: 'PG', label: 'Practice group', sortOrder: 1 },
        { id: 'opt-client', value: 'Client', label: 'Client', sortOrder: 2 },
      ],
    }),
    optional({ fieldKey: 'clientNumber', displayName: 'Client number', fieldType: 'ShortText', section: 'Intake', sortOrder: 4, rules: [requireWhenClient] }),
    optional({ fieldKey: 'businessValue', displayName: 'Business value', fieldType: 'Number', section: 'Value mapping', minValue: 1, maxValue: 5, sortOrder: 5 }),
    optional({ fieldKey: 'efficiencyGain', displayName: 'Efficiency gain', fieldType: 'Number', section: 'Value mapping', minValue: 1, maxValue: 5, sortOrder: 6 }),
    optional({ fieldKey: 'levelOfEffort', displayName: 'Level of effort', fieldType: 'Number', section: 'Value mapping', minValue: 1, maxValue: 5, sortOrder: 7 }),
    optional({ fieldKey: 'targetUsers', displayName: 'Target users', fieldType: 'ShortText', section: 'Solution details', sortOrder: 8 }),
    optional({ fieldKey: 'assignedAnalyst', displayName: 'Assigned analyst', fieldType: 'ShortText', section: 'Triage', sortOrder: 9 }),
  ],
};

function mockHooks(
  overrides: { create?: jest.Mock; save?: jest.Mock; similar?: SimilarRequestDto[] } = {},
) {
  const createMutate = overrides.create ?? jest.fn().mockResolvedValue(buildRequestDto());
  const saveMutate = overrides.save ?? jest.fn().mockResolvedValue(undefined);

  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<typeof useMe>);
  mockedFetchFields.mockResolvedValue(schema);
  mockedUseLifecycle.mockReturnValue({
    data: buildLifecycleConfig(),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useLifecycleConfig>);
  mockedUseCreate.mockReturnValue({ mutateAsync: createMutate, isPending: false, isError: false } as unknown as ReturnType<typeof useCreateRequest>);
  mockedUseSaveDraft.mockReturnValue({ mutateAsync: saveMutate, isPending: false, isError: false } as unknown as ReturnType<typeof useSaveDraft>);
  mockedUseSimilar.mockReturnValue({ data: overrides.similar ?? [] } as unknown as ReturnType<typeof useSimilarRequests>);

  return { createMutate, saveMutate };
}

describe('IntakeFormPage', () => {
  afterEach(() => jest.clearAllMocks());

  it('IntakeFormPage — renders the four numbered create sections', async () => {
    // Arrange
    mockHooks();

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });

    // Assert
    for (const name of ['Intake', 'Value mapping', 'Solution details', 'Triage']) {
      expect(await screen.findByRole('heading', { name, level: 2 })).toBeInTheDocument();
    }
    expect(await axe(container)).toHaveNoViolations();
  });

  it('IntakeFormPage — submitting empty shows the name error and does not create', async () => {
    // Arrange
    const { createMutate } = mockHooks();

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });
    const submit = await screen.findByRole('button', { name: 'Submit request' });
    await userEvent.click(submit);

    // Assert
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  // Heavy multi-step flow; slow under coverage instrumentation. Wider per-test budget.
  it('IntakeFormPage — filling name and description submits and navigates', async () => {
    // Arrange
    const { createMutate } = mockHooks();

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Meeting-notes extraction');
    await userEvent.type(screen.getByRole('textbox', { name: 'Description (optional)' }), 'Pull action items.');
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    // Assert
    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meeting-notes extraction' })),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/requests/AIS-00000001');
    expect(await axe(container)).toHaveNoViolations();
  }, 15000);

  it('IntakeFormPage — Save draft calls the draft mutation and navigates to the list', async () => {
    // Arrange
    const { saveMutate } = mockHooks();

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save draft' }));

    // Assert
    await waitFor(() =>
      expect(saveMutate).toHaveBeenCalledWith(expect.objectContaining({ objectType: 'Request' })),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/requests');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('IntakeFormPage — the client-number field appears only when the requestor type is Client', async () => {
    // Arrange
    mockHooks();

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });
    const requestorType = await screen.findByRole('combobox', { name: 'Requestor type (optional)' });

    // Assert
    expect(screen.queryByRole('textbox', { name: 'Client number' })).not.toBeInTheDocument();
    await userEvent.selectOptions(requestorType, 'Client');
    expect(await screen.findByRole('textbox', { name: 'Client number' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('IntakeFormPage — the priority score updates when a slider changes', async () => {
    // Arrange
    mockHooks();

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });
    const score = await screen.findByLabelText('Priority score');

    // Assert
    expect(score).toHaveTextContent('3');
    fireEvent.change(screen.getByRole('slider', { name: 'Business value' }), { target: { value: '5' } });
    await waitFor(() => expect(score).toHaveTextContent('5'));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('IntakeFormPage — the similar-requests panel shows the hint when there are no matches', async () => {
    // Arrange
    mockHooks();

    // Act
    renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });

    // Assert
    expect(
      await screen.findByText('Matches appear here as you type the name and description.'),
    ).toBeInTheDocument();
  });

  it('IntakeFormPage — a similar match can be linked as related and dismissed', async () => {
    // Arrange
    const match: SimilarRequestDto = {
      id: 'AIS-00000009' as SimilarRequestDto['id'],
      name: 'Contract clause finder',
      stage: 'build',
      origin: 'AI Solutions',
    };
    mockHooks({ similar: [match] });

    // Act
    const { container } = renderWithProviders(<IntakeFormPage />, { route: '/requests/new' });
    expect(await screen.findByText('Contract clause finder')).toBeInTheDocument();

    // Assert — linking flips the affordance to the "Linked as related" pill.
    await userEvent.click(screen.getByRole('button', { name: 'Link as related' }));
    expect(await screen.findByText('Linked as related')).toBeInTheDocument();

    // Dismissing removes the match from the panel.
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss AIS-00000009' }));
    await waitFor(() => expect(screen.queryByText('Contract clause finder')).not.toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
