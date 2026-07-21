// Component tests for the Tasks & gates tab. Mocks the data hooks + current-user hook and renders the
// real TaskRow / TaskComposer children, so this file also covers their branches: loading / error /
// empty / grouped states, check-off, notes toggle, typed-field controls (url / select / checkbox),
// phase collapse, add-task and add-bundle flows, and the on-hold paused banner — each meaningfully
// different state with a jest-axe assertion (web-testing.md).

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  ApprovalRequestId,
  FieldDefinitionId,
  RecordId,
  TaskDto,
  TaskId,
  TaskLibraryFieldDto,
  WorkspaceId,
} from '@shared/types';

import { renderWithProviders, buildApprovalRequest, buildMe } from '@/test-utils';
import { useMe } from '@/features/users/useMe';
import { useApprovalRequests, useReRequest, useSubmitDecision } from '@/features/gates';

import { TasksTab } from './TasksTab';
import { useCreateTasks, usePatchTask, usePromoteTask, useTaskBundles, useTaskLibrary, useTasks } from './useTasks';

jest.mock('@/features/users/useMe');
jest.mock('./useTasks');
// Keep the real GateBlock (so the gate renders through TasksTab) but stub the data/mutation hooks.
jest.mock('@/features/gates', () => ({
  ...jest.requireActual('@/features/gates'),
  useApprovalRequests: jest.fn(),
  useSubmitDecision: jest.fn(),
  useReRequest: jest.fn(),
}));

const mockedUseGates = useApprovalRequests as jest.MockedFunction<typeof useApprovalRequests>;
const mockedUseSubmit = useSubmitDecision as jest.MockedFunction<typeof useSubmitDecision>;
const mockedUseReRequest = useReRequest as jest.MockedFunction<typeof useReRequest>;

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseTasks = useTasks as jest.MockedFunction<typeof useTasks>;
const mockedUseBundles = useTaskBundles as jest.MockedFunction<typeof useTaskBundles>;
const mockedUseLibrary = useTaskLibrary as jest.MockedFunction<typeof useTaskLibrary>;
const mockedUseCreate = useCreateTasks as jest.MockedFunction<typeof useCreateTasks>;
const mockedUsePatch = usePatchTask as jest.MockedFunction<typeof usePatchTask>;
const mockedUsePromote = usePromoteTask as jest.MockedFunction<typeof usePromoteTask>;

const RECORD = 'AIS-00000001' as RecordId;
const WORKSPACE = '1A150000-0000-4000-8000-000000000001' as WorkspaceId;
const REPO_FIELD = 'field-repo' as FieldDefinitionId;
const ENV_FIELD = 'field-env' as FieldDefinitionId;
const DONE_FIELD = 'field-done' as FieldDefinitionId;

const me = buildMe();

function buildTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: (overrides.id ?? 'task-1') as TaskId,
    parentRequestId: RECORD,
    title: 'Confirm scope with the requestor',
    phase: 'Triage',
    status: 'Open',
    assignee: me.user.id,
    createdAt: '2026-07-01T09:00:00Z',
    ...overrides,
  };
}

const LIBRARY: TaskLibraryFieldDto[] = [
  { id: REPO_FIELD, fieldKey: 'repoUrl', displayName: 'Repo URL', fieldType: 'Url', options: [], sortOrder: 1, isRetired: false },
  {
    id: ENV_FIELD,
    fieldKey: 'environment',
    displayName: 'Environment',
    fieldType: 'Select',
    options: [
      { id: 'o1', value: 'Dev', label: 'Dev', sortOrder: 1 },
      { id: 'o2', value: 'Production', label: 'Production', sortOrder: 2 },
    ],
    sortOrder: 2,
    isRetired: false,
  },
  { id: DONE_FIELD, fieldKey: 'privacy', displayName: 'Privacy signed off', fieldType: 'Checkbox', options: [], sortOrder: 3, isRetired: false },
];

function mockTasks(state: Partial<ReturnType<typeof useTasks>>) {
  mockedUseTasks.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null, ...state } as unknown as ReturnType<typeof useTasks>);
}

function mockCreate(mutate = jest.fn(), extra: Record<string, unknown> = {}) {
  mockedUseCreate.mockReturnValue({ mutate, isPending: false, isError: false, error: null, ...extra } as unknown as ReturnType<typeof useCreateTasks>);
  return mutate;
}

function mockPatch(mutate = jest.fn(), extra: Record<string, unknown> = {}) {
  mockedUsePatch.mockReturnValue({ mutate, isPending: false, ...extra } as unknown as ReturnType<typeof usePatchTask>);
  return mutate;
}

function mockPromote(mutate = jest.fn(), extra: Record<string, unknown> = {}) {
  mockedUsePromote.mockReturnValue({ mutate, isPending: false, isError: false, error: null, variables: undefined, ...extra } as unknown as ReturnType<typeof usePromoteTask>);
  return mutate;
}

function mockGates(gates: ReturnType<typeof buildApprovalRequest>[] = []) {
  mockedUseGates.mockReturnValue({ data: gates } as unknown as ReturnType<typeof useApprovalRequests>);
  const mutation = { mutate: jest.fn(), isPending: false, isError: false, error: null };
  mockedUseSubmit.mockReturnValue(mutation as unknown as ReturnType<typeof useSubmitDecision>);
  mockedUseReRequest.mockReturnValue(mutation as unknown as ReturnType<typeof useReRequest>);
  return mutation;
}

beforeEach(() => {
  mockedUseMe.mockReturnValue({ data: me } as ReturnType<typeof useMe>);
  mockedUseBundles.mockReturnValue({ data: [{ id: 'b1', name: 'Drafting assistant', tasks: [] }] } as unknown as ReturnType<typeof useTaskBundles>);
  mockedUseLibrary.mockReturnValue({ data: LIBRARY } as unknown as ReturnType<typeof useTaskLibrary>);
  mockCreate();
  mockPatch();
  mockPromote();
  mockGates();
});

afterEach(() => jest.clearAllMocks());

function render(paused = false) {
  return renderWithProviders(<TasksTab recordId={RECORD} workspaceId={WORKSPACE} paused={paused} />);
}

describe('TasksTab', () => {
  it('TasksTab — loading — shows a loading status', () => {
    // Arrange
    mockTasks({ isLoading: true });

    // Act
    render();

    // Assert
    expect(screen.getByText('Loading tasks…')).toBeInTheDocument();
  });

  it('TasksTab — error — shows an inline error alert', () => {
    // Arrange
    mockTasks({ isError: true, error: new Error('boom') });

    // Act
    render();

    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('TasksTab — empty — shows the empty message and the composer', async () => {
    // Arrange
    mockTasks({ data: [] });

    // Act
    const { container } = render();

    // Assert
    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Add task/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TasksTab — groups tasks by phase and counts open tasks', async () => {
    // Arrange
    mockTasks({
      data: [
        buildTask({ id: 't1' as TaskId, phase: 'Triage', title: 'Scope' }),
        buildTask({ id: 't2' as TaskId, phase: 'Execution', title: 'Wire it up', status: 'Done', completedAt: '2026-06-24T10:00:00Z' }),
      ],
    });

    // Act
    const { container } = render();

    // Assert — phase headers, both titles, and "1 open" (Done excluded).
    expect(screen.getByRole('button', { name: /Triage/ })).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Wire it up')).toBeInTheDocument();
    expect(screen.getByText('1 open')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TasksTab — checking off a task patches it Done', async () => {
    // Arrange
    const patch = mockPatch();
    mockTasks({ data: [buildTask({ id: 't1' as TaskId, title: 'Scope' })] });

    // Act
    render();
    await userEvent.click(screen.getByRole('button', { name: 'Mark Scope done' }));

    // Assert
    expect(patch).toHaveBeenCalledWith({ taskId: 't1', patch: { status: 'Done' } });
  });

  it('TasksTab — the notes toggle expands the notes textarea', async () => {
    // Arrange
    mockTasks({ data: [buildTask({ id: 't1' as TaskId })] });

    // Act
    render();
    const toggle = screen.getByRole('button', { name: 'Task notes and decisions' });
    await userEvent.click(toggle);

    // Assert
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Notes & decisions')).toBeInTheDocument();
  });

  it('TasksTab — renders a URL typed field with an open link', async () => {
    // Arrange
    mockTasks({
      data: [
        buildTask({
          id: 't1' as TaskId,
          typedField: { definitionId: REPO_FIELD, label: 'Repo URL', value: { kind: 'url', url: 'github.com/mws/x' } },
        }),
      ],
    });

    // Act
    const { container } = render();

    // Assert — the field label (scoped to the row; the composer field-picker also lists "Repo URL"),
    // its value input, and an external-open link.
    expect(screen.getByText('Repo URL', { selector: '.task-field__label' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('github.com/mws/x')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open link in a new tab' })).toHaveAttribute('href', 'https://github.com/mws/x');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TasksTab — renders a select typed field with the library options', () => {
    // Arrange
    mockTasks({
      data: [
        buildTask({
          id: 't1' as TaskId,
          typedField: { definitionId: ENV_FIELD, label: 'Environment', value: { kind: 'select', selectedOption: 'Dev' } },
        }),
      ],
    });

    // Act
    render();

    // Assert — the value select is present with the seeded option label.
    const select = screen.getByRole('combobox', { name: 'Field value' });
    expect(select).toHaveValue('Dev');
    expect(screen.getByRole('option', { name: 'Production' })).toBeInTheDocument();
  });

  it('TasksTab — a checkbox typed field toggles via patch', async () => {
    // Arrange
    const patch = mockPatch();
    mockTasks({
      data: [
        buildTask({
          id: 't1' as TaskId,
          typedField: { definitionId: DONE_FIELD, label: 'Privacy signed off', value: { kind: 'checkbox', checked: false } },
        }),
      ],
    });

    // Act
    render();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Field value' }));

    // Assert
    expect(patch).toHaveBeenCalledWith({ taskId: 't1', patch: { typedField: { definitionId: DONE_FIELD, value: { kind: 'checkbox', checked: true } } } });
  });

  it('TasksTab — collapsing a phase group hides its tasks', async () => {
    // Arrange
    mockTasks({ data: [buildTask({ id: 't1' as TaskId, phase: 'Triage', title: 'Scope' })] });

    // Act
    render();
    await userEvent.click(screen.getByRole('button', { name: /Triage/ }));

    // Assert — the task disappears when the group collapses.
    expect(screen.queryByText('Scope')).not.toBeInTheDocument();
  });

  it('TasksTab — adding a single task submits a create request', async () => {
    // Arrange
    const create = mockCreate();
    mockTasks({ data: [] });

    // Act
    render();
    await userEvent.type(screen.getByRole('textbox', { name: 'New task title' }), 'Draft QA set');
    // Two buttons are named "Add task" (the header jump-link and the composer submit); the submit is last.
    const addButtons = screen.getAllByRole('button', { name: 'Add task' });
    await userEvent.click(addButtons[addButtons.length - 1] as HTMLElement);

    // Assert — a single-kind request with the typed title + default phase.
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'single', title: 'Draft QA set' }));
  });

  it('TasksTab — applying a bundle submits a bundle request', async () => {
    // Arrange
    const create = mockCreate();
    mockTasks({ data: [] });

    // Act
    render();
    await userEvent.click(screen.getByRole('tab', { name: /Add bundle/ }));
    await userEvent.selectOptions(screen.getByLabelText('Apply a task bundle template'), 'b1');
    await userEvent.click(screen.getByRole('button', { name: /Add bundle/ }));

    // Assert
    expect(create).toHaveBeenCalledWith({ kind: 'bundle', bundleTemplateId: 'b1' });
  });

  it('TasksTab — on hold — shows the paused banner and disables check-off', async () => {
    // Arrange
    mockTasks({ data: [buildTask({ id: 't1' as TaskId, title: 'Scope' })] });

    // Act
    const { container } = render(true);

    // Assert — Slice 26 revised copy: the banner references the tri-state and points to the Status tab.
    expect(screen.getByText('This record is not in progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Scope done' })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TasksTab — an open gate renders inline under its target phase, even with no tasks there', async () => {
    // Arrange — no tasks, one open readiness gate targeting the Validation phase.
    mockTasks({ data: [] });
    mockGates([buildApprovalRequest()]);

    // Act
    const { container } = render();

    // Assert — the Validation phase group + gate appear; the "no tasks yet" empty state is suppressed.
    expect(screen.getByLabelText('Gate: QA readiness gate')).toBeInTheDocument();
    expect(screen.getByText('Gate · fires on Execution → Validation')).toBeInTheDocument();
    expect(screen.queryByText(/No tasks yet/i)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TasksTab — a failed create surfaces the add-task warning', () => {
    // Arrange
    mockCreate(jest.fn(), { isError: true, error: new Error('nope') });
    mockTasks({ data: [] });

    // Act
    render();

    // Assert
    expect(screen.getByText(/could not be added/)).toBeInTheDocument();
  });

  it('TasksTab — a failed promote surfaces the promote warning', () => {
    // Arrange
    mockPromote(jest.fn(), { isError: true, error: new Error('nope') });
    mockTasks({ data: [buildTask({ id: 't1' as TaskId })] });

    // Act
    render();

    // Assert
    expect(screen.getByText(/could not be promoted/)).toBeInTheDocument();
  });

  it('TasksTab — a failed approval action surfaces the approval warning', () => {
    // Arrange — the submit-decision mutation reports an error
    mockTasks({ data: [] });
    mockGates();
    mockedUseSubmit.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isError: true,
      error: new Error('nope'),
    } as unknown as ReturnType<typeof useSubmitDecision>);

    // Act
    render();

    // Assert
    expect(screen.getByText(/approval action could not be saved/)).toBeInTheDocument();
  });

  it('TasksTab — a gate whose target stage is off the phase order renders under Unphased', () => {
    // Arrange
    mockTasks({ data: [] });
    mockGates([buildApprovalRequest({ toStage: 'Nowhere' })]);

    // Act
    render();

    // Assert — it still renders (grouped under the Unphased fallback), not dropped.
    expect(screen.getByLabelText('Gate: QA readiness gate')).toBeInTheDocument();
  });

  it('TasksTab — two gates targeting the same phase both render', () => {
    // Arrange
    mockTasks({ data: [] });
    mockGates([
      buildApprovalRequest({ id: 'g1' as ApprovalRequestId }),
      buildApprovalRequest({ id: 'g2' as ApprovalRequestId }),
    ]);

    // Act
    render();

    // Assert — the second gate exercises the "append to the existing bucket" branch.
    expect(screen.getAllByLabelText('Gate: QA readiness gate')).toHaveLength(2);
  });

  it('TasksTab — renders without a current user (me not yet loaded)', () => {
    // Arrange
    mockedUseMe.mockReturnValue({ data: undefined } as ReturnType<typeof useMe>);
    mockTasks({ data: [buildTask({ id: 't1' as TaskId, title: 'Scope' })] });

    // Act
    render();

    // Assert — no crash; the task still lists.
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });

  it('TasksTab — marks the in-flight task while a promote is pending', () => {
    // Arrange — a promote is running for t1
    mockPromote(jest.fn(), { isPending: true, variables: 't1' });
    mockTasks({ data: [buildTask({ id: 't1' as TaskId, title: 'Scope' })] });

    // Act
    render();

    // Assert — the row still renders while the promote is pending.
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });
});
