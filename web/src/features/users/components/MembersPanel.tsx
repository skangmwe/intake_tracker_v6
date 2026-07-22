// S29 Members panel — the workspace membership list plus the add-member flow and the row actions.
// ADD MEMBER reveals the add form (collapsed by default so the list leads). The kebab actions route
// here: Edit details opens the level editor; Suspend / Reactivate toggle the account inline; Remove
// from workspace confirms in a dialog; Cancel invitation cancels a pending invite. Owns the
// list-surface view state (sort, per-column filters, page) so the shared TableShell + TableFooter
// render like the other list screens. Renders the three non-data states (web-component-architecture.md).

import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import type { AccessLevel, WorkspaceId, WorkspaceMemberDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import {
  type FilterOption,
  type FilterValue,
  type SortState,
  TableFooter,
} from '@/shared/components/Table';
import { problemMessage } from '@/shared/http/problemMessage';

import { LEVEL_OPTIONS, MEMBERS_PAGE_SIZE, STATUS_FILTER_OPTIONS } from '../constants';
import { type MemberColumnKey, type MembersFilters, selectMembersView } from '../membersView';
import {
  useCancelInvitation,
  useDeactivateMember,
  useMembers,
  useSetMemberSuspension,
  useUpsertMember,
} from '../useMembers';
import { AddMemberForm } from './AddMemberForm';
import { DeactivateMemberDialog } from './DeactivateMemberDialog';
import { EditMemberDialog } from './EditMemberDialog';
import { MembersTable } from './MembersTable';

const NO_FILTERS: MembersFilters = {};

function optionsWithCounts(
  base: { value: string; label: string }[],
  members: WorkspaceMemberDto[],
  pick: (member: WorkspaceMemberDto) => string,
): FilterOption[] {
  return base.map((option) => ({
    ...option,
    count: members.filter((member) => pick(member) === option.value).length,
  }));
}

export function MembersPanel({ workspaceId }: { workspaceId: WorkspaceId }) {
  const members = useMembers(workspaceId);
  const levelUpsert = useUpsertMember(workspaceId);
  const remove = useDeactivateMember(workspaceId);
  const suspension = useSetMemberSuspension(workspaceId);
  const cancelInvite = useCancelInvitation(workspaceId);

  const [addOpen, setAddOpen] = useState(false);
  const [toEdit, setToEdit] = useState<WorkspaceMemberDto | null>(null);
  const [toRemove, setToRemove] = useState<WorkspaceMemberDto | null>(null);
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<MembersFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);

  const allMembers = useMemo(() => members.data?.members ?? [], [members.data]);
  const view = useMemo(
    () => selectMembersView(allMembers, sort, filters, page, MEMBERS_PAGE_SIZE),
    [allMembers, sort, filters, page],
  );
  const levelOptions = useMemo(
    () => optionsWithCounts(LEVEL_OPTIONS, allMembers, (member) => member.level),
    [allMembers],
  );
  const statusOptions = useMemo(
    () => optionsWithCounts(STATUS_FILTER_OPTIONS, allMembers, (member) => member.status),
    [allMembers],
  );

  const setSuspended = (member: WorkspaceMemberDto, suspended: boolean) => {
    if (member.userId !== null) suspension.mutate({ userId: member.userId, suspended });
  };

  const onEditDetails = (member: WorkspaceMemberDto) => {
    levelUpsert.reset();
    setToEdit(member);
  };

  const onSaveEdit = (level: AccessLevel) => {
    const userId = toEdit?.userId;
    if (userId == null) return;
    levelUpsert.mutate({ userId, level }, { onSuccess: () => setToEdit(null) });
  };

  const onRemoveMember = (member: WorkspaceMemberDto) => {
    remove.reset();
    setToRemove(member);
  };

  const confirmRemove = () => {
    const userId = toRemove?.userId;
    if (userId == null) return;
    remove.mutate(userId, { onSuccess: () => setToRemove(null) });
  };

  const onCancelInvitation = (member: WorkspaceMemberDto) => {
    if (member.invitationId !== null) cancelInvite.mutate(member.invitationId);
  };

  const onFilterChange = (column: MemberColumnKey, value: FilterValue) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
    setPage(1);
  };

  const onSortChange = (next: SortState | undefined) => {
    setSort(next);
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setPage(1);
  };

  const actionError = suspension.isError
    ? suspension.error
    : cancelInvite.isError
      ? cancelInvite.error
      : null;

  return (
    <div className="users-access__panel">
      <div className="users-access__toolbar">
        <Button onClick={() => setAddOpen(true)} aria-haspopup="dialog">
          <Plus size={16} weight="regular" aria-hidden />
          Add member
        </Button>
      </div>

      {addOpen && <AddMemberForm workspaceId={workspaceId} onClose={() => setAddOpen(false)} />}

      {actionError != null && (
        <p className="mws-alert mws-alert--error users-access__level-error" role="alert">
          {problemMessage(actionError)}
        </p>
      )}

      {members.isLoading && (
        <p className="caption" role="status">
          Loading members…
        </p>
      )}

      {members.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The member list could not be loaded. Try again in a moment.
        </p>
      )}

      {members.data && allMembers.length === 0 && (
        <p className="users-access__empty">No members yet. Add one by email above.</p>
      )}

      {members.data && allMembers.length > 0 && view.total === 0 && (
        <div className="users-access__no-matches">
          <p className="users-access__no-matches-title">No members match these filters</p>
          <Button variant="secondary" compact onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {members.data && view.total > 0 && (
        <>
          <MembersTable
            rows={view.rows}
            sort={sort}
            onSortChange={onSortChange}
            filters={filters}
            onFilterChange={onFilterChange}
            levelOptions={levelOptions}
            statusOptions={statusOptions}
            onEditDetails={onEditDetails}
            onSuspend={(member) => setSuspended(member, true)}
            onReactivate={(member) => setSuspended(member, false)}
            onRemove={onRemoveMember}
            onCancelInvitation={onCancelInvitation}
          />
          <TableFooter
            page={Math.min(page, view.totalPages)}
            totalPages={view.totalPages}
            total={view.total}
            start={view.start}
            end={view.end}
            noun="people"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(view.totalPages, prev + 1))}
          />
        </>
      )}

      {toEdit && (
        <EditMemberDialog
          member={toEdit}
          onSave={onSaveEdit}
          onCancel={() => setToEdit(null)}
          isPending={levelUpsert.isPending}
          error={levelUpsert.isError ? levelUpsert.error : null}
        />
      )}

      {toRemove && (
        <DeactivateMemberDialog
          member={toRemove}
          onConfirm={confirmRemove}
          onCancel={() => setToRemove(null)}
          isPending={remove.isPending}
          error={remove.isError ? remove.error : null}
        />
      )}
    </div>
  );
}
