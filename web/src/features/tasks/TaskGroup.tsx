// One collapsible phase group on the Tasks & gates tab (S4/S5): the navy phase header, its task list,
// and any gates whose target stage lands in this phase (rendered inline below the tasks, per the
// prototype). Presentational — collapse state and the mutations live in the parent TasksTab.

import { CaretDown, CaretRight } from '@phosphor-icons/react';

import type { ApprovalRequestDto, TaskDto, TaskLibraryFieldDto, TaskPatchRequest, TaskPhase, UserId } from '@shared/types';

import { GateBlock } from '@/features/gates';

import { TaskRow } from './TaskRow';

interface TaskGroupProps {
  phase: TaskPhase;
  tasks: TaskDto[];
  gates: ApprovalRequestDto[];
  isCollapsed: boolean;
  onToggle: () => void;
  currentUserId: UserId | undefined;
  library: TaskLibraryFieldDto[];
  taskDisabled: boolean;
  gateDisabled: boolean;
  onPatch: (taskId: string, patch: TaskPatchRequest) => void;
  onPromote: (taskId: string) => void;
  promotingTaskId: string | null;
  onDecision: (
    approvalRequestId: string,
    slotIndex: number,
    decidedByUserId: string,
    decision: 'Approved' | 'Rejected',
    comment?: string,
  ) => void;
  onReRequest: (approvalRequestId: string, slotIndex: number) => void;
}

export function TaskGroup({
  phase,
  tasks,
  gates,
  isCollapsed,
  onToggle,
  currentUserId,
  library,
  taskDisabled,
  gateDisabled,
  onPatch,
  onPromote,
  promotingTaskId,
  onDecision,
  onReRequest,
}: TaskGroupProps) {
  return (
    <div className="task-group">
      <button type="button" className="task-group__header" aria-expanded={!isCollapsed} onClick={onToggle}>
        {isCollapsed ? <CaretRight size={13} aria-hidden /> : <CaretDown size={13} aria-hidden />}
        <span className="task-group__phase">{phase}</span>
        <span className="task-group__count">{tasks.length}</span>
      </button>
      {!isCollapsed && (
        <>
          <ul className="task-list">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                currentUserId={currentUserId}
                library={library}
                disabled={taskDisabled}
                onPatch={(body) => onPatch(task.id, body)}
                onPromote={() => onPromote(task.id)}
                promoting={promotingTaskId === task.id}
              />
            ))}
          </ul>
          {gates.map((gate) => (
            <GateBlock
              key={gate.id}
              gate={gate}
              disabled={gateDisabled}
              onDecision={onDecision}
              onReRequest={onReRequest}
            />
          ))}
        </>
      )}
    </div>
  );
}
