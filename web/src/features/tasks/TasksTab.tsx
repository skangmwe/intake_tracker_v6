// The Tasks & gates tab (S4/S5). Phase-grouped collapsible list (navy phase headers) with a per-task
// check-off / notes / typed-field row, gates rendered inline within their target phase group (slice 8),
// and the gray-boxed composer (Add task / Add bundle). A pale-gold banner appears when the record is on
// hold — task completion pauses until it returns to Active (gate sign-off is unaffected). Explicit
// loading / error / empty states (web-component-architecture.md).

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PauseCircle, Plus } from '@phosphor-icons/react';

import type {
  ApprovalRequestDto,
  RecordId,
  TaskCreateRequest,
  TaskPatchRequest,
  TaskPhase,
  UserId,
  WorkspaceId,
} from '@shared/types';

import { problemMessage } from '@/shared/http/problemMessage';
import { useMe } from '@/features/users/useMe';
import { useApprovalRequests, useReRequest, useSubmitDecision } from '@/features/gates';

import { TaskComposer, type AddTaskInput, type ComposerTab } from './TaskComposer';
import { TaskGroup } from './TaskGroup';
import { PHASE_ORDER, emptyValueForKind, groupTasksByPhase, openTaskCount } from './taskView';
import { useCreateTasks, usePatchTask, usePromoteTask, useTaskBundles, useTaskLibrary, useTasks } from './useTasks';
import './tasks.css';

interface TasksTabProps {
  recordId: RecordId;
  workspaceId: WorkspaceId;
  /** True when the record is on hold — task completion pauses until it returns to Active. */
  paused: boolean;
}

/** A gate's target-stage label (e.g. "Validation") coerced to the phase group it renders under. */
function gateToPhase(gate: ApprovalRequestDto): TaskPhase {
  return (PHASE_ORDER as readonly string[]).includes(gate.toStage) ? (gate.toStage as TaskPhase) : 'Unphased';
}

export function TasksTab({ recordId, workspaceId, paused }: TasksTabProps) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const currentUserId = me?.user.id;

  const { data: tasks, isLoading, isError, error } = useTasks(recordId);
  const { data: gates } = useApprovalRequests(recordId);
  const { data: bundles } = useTaskBundles(workspaceId);
  const { data: library } = useTaskLibrary(workspaceId);
  const createTasks = useCreateTasks(recordId);
  const patchTask = usePatchTask(recordId);
  const promoteTask = usePromoteTask(recordId);
  const submitDecision = useSubmitDecision(recordId);
  const reRequest = useReRequest(recordId);

  const [collapsed, setCollapsed] = useState<ReadonlySet<TaskPhase>>(new Set());
  const [composerTab, setComposerTab] = useState<ComposerTab>('task');
  const titleRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => tasks ?? [], [tasks]);
  const gateList = useMemo(() => gates ?? [], [gates]);

  // Merge task phases + gate target phases into one ordered set so a gate renders even in a phase
  // that has no tasks yet.
  const phaseGroups = useMemo(() => {
    const taskGroups = new Map(groupTasksByPhase(list).map((group) => [group.phase, group.tasks]));
    const gatesByPhase = new Map<TaskPhase, ApprovalRequestDto[]>();
    for (const gate of gateList) {
      const phase = gateToPhase(gate);
      const bucket = gatesByPhase.get(phase);
      if (bucket) bucket.push(gate);
      else gatesByPhase.set(phase, [gate]);
    }
    return PHASE_ORDER.filter((phase) => taskGroups.has(phase) || gatesByPhase.has(phase)).map((phase) => ({
      phase,
      tasks: taskGroups.get(phase) ?? [],
      gates: gatesByPhase.get(phase) ?? [],
    }));
  }, [list, gateList]);

  const focusAddTask = () => {
    setComposerTab('task');
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const togglePhase = (phase: TaskPhase) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });

  const addTask = (input: AddTaskInput) => {
    const request: TaskCreateRequest = {
      kind: 'single',
      title: input.title,
      phase: input.phase,
      ...(input.field
        ? { typedField: { definitionId: input.field.definitionId, value: emptyValueForKind(input.field.kind) } }
        : {}),
    };
    createTasks.mutate(request);
  };

  const addBundle = (bundleId: string) => createTasks.mutate({ kind: 'bundle', bundleTemplateId: bundleId });
  const patch = (taskId: string, body: TaskPatchRequest) => patchTask.mutate({ taskId, patch: body });

  // Promote a task to its own Request, then open the created draft in the intake form.
  const promote = (taskId: string) =>
    promoteTask.mutate(taskId, { onSuccess: (result) => navigate(`/requests/new?draftId=${result.draftId}`) });

  const decide = (
    approvalRequestId: string,
    slotIndex: number,
    decidedByUserId: string,
    decision: 'Approved' | 'Rejected',
    comment?: string,
  ) =>
    // decidedByUserId is echoed from the frozen slot's eligible members (a branded UserId at rest);
    // the select surfaces it as a plain string, so re-brand it at the wire boundary.
    submitDecision.mutate({
      approvalRequestId,
      request: {
        slotIndex,
        decidedByUserId: decidedByUserId as UserId,
        decision,
        ...(comment !== undefined ? { comment } : {}),
      },
    });

  const reRequestSlot = (approvalRequestId: string, slotIndex: number) =>
    reRequest.mutate({ approvalRequestId, slotIndex });

  // Slice 26 — the hold guard also disables gate Approve/Reject/Re-request. Server-side, the same
  // three transitions THROW 51201 (409 record-on-hold); this keeps the UI honest before the click.
  const gateDisabled = paused || submitDecision.isPending || reRequest.isPending;

  return (
    <section className="tasks" aria-label="Tasks and gates">
      {paused && (
        <div className="tasks-paused" role="status">
          <PauseCircle size={20} aria-hidden />
          <span>
            <span className="tasks-paused__title">This record is not in progress</span>
            <span className="tasks-paused__note">
              Task completion and gate approvals are paused. Set the status back to <strong>In progress</strong>
              {' '}from the Status tab to continue.
            </span>
          </span>
        </div>
      )}

      <div className="tasks-header">
        <span className="tasks-header__label">Tasks</span>
        <button type="button" className="tasks-header__add" onClick={focusAddTask}>
          <Plus size={14} aria-hidden /> Add task
        </button>
        <span className="tasks-header__count">{openTaskCount(list)} open</span>
      </div>

      {isLoading && (
        <p className="caption" role="status">
          Loading tasks…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(error, 'Tasks could not be loaded. Try again in a moment.')}
        </p>
      )}

      {!isLoading && !isError && phaseGroups.length === 0 && (
        <p className="tasks-empty caption">No tasks yet. Add one below or apply a bundle to get started.</p>
      )}

      {!isLoading &&
        !isError &&
        phaseGroups.map((group) => (
          <TaskGroup
            key={group.phase}
            phase={group.phase}
            tasks={group.tasks}
            gates={group.gates}
            isCollapsed={collapsed.has(group.phase)}
            onToggle={() => togglePhase(group.phase)}
            currentUserId={currentUserId}
            library={library ?? []}
            taskDisabled={paused || patchTask.isPending}
            gateDisabled={gateDisabled}
            onPatch={patch}
            onPromote={promote}
            promotingTaskId={promoteTask.isPending ? (promoteTask.variables ?? null) : null}
            onDecision={decide}
            onReRequest={reRequestSlot}
          />
        ))}

      {createTasks.isError && (
        <p className="mws-alert mws-alert--warning" role="alert">
          {problemMessage(createTasks.error, 'That task could not be added. Try again in a moment.')}
        </p>
      )}

      {promoteTask.isError && (
        <p className="mws-alert mws-alert--warning" role="alert">
          {problemMessage(promoteTask.error, 'That task could not be promoted. Try again in a moment.')}
        </p>
      )}

      {(submitDecision.isError || reRequest.isError) && (
        <p className="mws-alert mws-alert--warning" role="alert">
          {problemMessage(
            submitDecision.error ?? reRequest.error,
            'That approval action could not be saved. Try again in a moment.',
          )}
        </p>
      )}

      <TaskComposer
        library={library ?? []}
        bundles={bundles ?? []}
        disabled={paused || createTasks.isPending}
        isPending={createTasks.isPending}
        tab={composerTab}
        onTab={setComposerTab}
        titleRef={titleRef}
        onAddTask={addTask}
        onAddBundle={addBundle}
      />
    </section>
  );
}
