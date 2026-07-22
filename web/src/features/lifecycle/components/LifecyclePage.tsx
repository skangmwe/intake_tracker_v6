// Lifecycle & gates admin surface (S31 — prototyped). A workspace admin defines one or more
// per-request-type lifecycles, each with ordered stages (name + status category) and approval
// gates (from→to, team-only approver slots), plus the workspace approver-team roster. The
// lifecycle/stage/gate structure autosaves after edits pause; the roster edits save immediately.
// Renders explicit loading / error / empty states (web-component-architecture.md).

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { UserId, WorkspaceId } from '@shared/types';

import { useMe } from '@/features/users/useMe';

import { AUTOSAVE_DEBOUNCE_MS } from '../constants';
import {
  draftFromConfig,
  draftToRequest,
  lifecycleDraftReducer,
  newLifecycle,
} from '../lifecycleDraft';
import { problemMessage } from '../problemMessage';
import {
  useAddApproverMember,
  useLifecycleConfig,
  useRemoveApproverMember,
  useSaveLifecycleConfig,
} from '../useLifecycle';
import { AutosaveStatus, type SaveState } from './AutosaveStatus';
import { LifecycleEditor } from './LifecycleEditor';
import { Button } from '@/shared/components/Button';

export function LifecyclePage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const adminMemberships = (me?.memberships ?? []).filter(
    (membership) => membership.level === 'WorkspaceAdmin',
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<WorkspaceId | null>(null);
  const workspaceId = selectedWorkspaceId ?? adminMemberships[0]?.workspaceId ?? null;
  const wsId = (workspaceId ?? '') as WorkspaceId;

  const { data: config, isLoading, isError } = useLifecycleConfig(workspaceId ?? undefined);
  const saveConfig = useSaveLifecycleConfig(wsId);
  const addMember = useAddApproverMember(wsId);
  const removeMember = useRemoveApproverMember(wsId);

  const [draft, dispatch] = useReducer(lifecycleDraftReducer, []);
  const [selectedUid, setSelectedUid] = useState<string>('');
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const seededWorkspaceRef = useRef<string | null>(null);
  const latest = useRef({ draft, save: saveConfig });
  latest.current = { draft, save: saveConfig };

  // Seed the editable draft once per workspace from the server config.
  useEffect(() => {
    if (!config || !workspaceId || seededWorkspaceRef.current === workspaceId) return;
    const seeded = draftFromConfig(config);
    dispatch({ type: 'REPLACE', drafts: seeded });
    setSavedJson(JSON.stringify(draftToRequest(seeded)));
    setSelectedUid(seeded.find((lifecycle) => lifecycle.isDefault)?.uid ?? seeded[0]?.uid ?? '');
    seededWorkspaceRef.current = workspaceId;
  }, [config, workspaceId]);

  const requestJson = useMemo(() => JSON.stringify(draftToRequest(draft)), [draft]);
  const isDirty = savedJson !== null && requestJson !== savedJson;

  // Debounced autosave of the lifecycle/stage/gate structure.
  useEffect(() => {
    if (!isDirty || !workspaceId) return undefined;
    const timer = setTimeout(() => {
      const { draft: current, save } = latest.current;
      save.mutate(draftToRequest(current), {
        onSuccess: (fresh) => {
          const reseeded = draftFromConfig(fresh);
          dispatch({ type: 'REPLACE', drafts: reseeded });
          setSavedJson(JSON.stringify(draftToRequest(reseeded)));
        },
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [requestJson, isDirty, workspaceId]);

  const eligibleByRole = useMemo(
    () =>
      new Map((config?.approverTeams ?? []).map((team) => [team.roleLabel, team.members.length])),
    [config],
  );

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading your workspaces…
      </p>
    );
  }

  if (isMeError && !me) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load your access. Try again in a moment.
      </p>
    );
  }

  if (adminMemberships.length === 0 || workspaceId === null) {
    return (
      <section className="mws-empty mws-empty--zero">
        <p className="body">
          You need to be a workspace admin to configure lifecycles. Ask an admin to grant access.
        </p>
      </section>
    );
  }

  const roleLabels = config?.roleLabels ?? [];
  const teams = config?.approverTeams ?? [];
  const selected = draft.find((lifecycle) => lifecycle.uid === selectedUid) ?? draft[0];

  const saveState: SaveState = saveConfig.isError
    ? 'error'
    : saveConfig.isPending
      ? 'saving'
      : isDirty
        ? 'unsaved'
        : 'saved';

  const addNewLifecycle = () => {
    const created = newLifecycle();
    dispatch({ type: 'LIFECYCLE_ADD', lifecycle: created });
    setSelectedUid(created.uid);
  };

  const removeLifecycle = (uid: string) => {
    const remaining = draft.filter((lifecycle) => lifecycle.uid !== uid);
    dispatch({ type: 'LIFECYCLE_REMOVE', uid });
    if (selectedUid === uid) setSelectedUid(remaining[0]?.uid ?? '');
  };

  const addTeamMember = async (roleLabel: string, person: string) => {
    await addMember.mutateAsync({ roleLabel, person });
  };

  const removeTeamMember = (roleLabel: string, userId: UserId) => {
    removeMember.mutate({ roleLabel, userId });
  };

  return (
    <div className="lifecycle-page">
      {/* The surface title + lead render in the shared SideNavLayout header; the autosave indicator
          for the lifecycle editor stays here, aligned to the end of its row. */}
      <header className="lifecycle-header">
        {config && (
          <AutosaveStatus
            state={saveState}
            error={saveState === 'error' ? problemMessage(saveConfig.error) : null}
          />
        )}
      </header>

      {adminMemberships.length > 1 && (
        <label className="mws-field">
          <span className="caption">Workspace</span>
          <select
            className="mws-select"
            data-ds="select"
            value={workspaceId}
            onChange={(event) => {
              seededWorkspaceRef.current = null;
              setSelectedWorkspaceId(event.target.value as WorkspaceId);
            }}
          >
            {adminMemberships.map((membership) => (
              <option key={membership.workspaceId} value={membership.workspaceId}>
                {membership.workspaceName}
              </option>
            ))}
          </select>
        </label>
      )}

      {isLoading && (
        <p className="caption" role="status">
          Loading the lifecycle configuration…
        </p>
      )}
      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          We couldn’t load the lifecycle configuration. Try again in a moment.
        </p>
      )}

      {config && draft.length === 0 && (
        <section className="mws-empty mws-empty--zero" aria-labelledby="no-lifecycle-heading">
          <h2 id="no-lifecycle-heading" className="h3">
            No lifecycles yet
          </h2>
          <p className="body">
            Create a lifecycle to define the stages and gates requests in this workspace move
            through.
          </p>
          <Button onClick={addNewLifecycle}>Create your first lifecycle</Button>
        </section>
      )}

      {config && selected && (
        <LifecycleEditor
          lifecycles={draft}
          selected={selected}
          selectedUid={selected.uid}
          roleLabels={roleLabels}
          teams={teams}
          eligibleByRole={eligibleByRole}
          dispatch={dispatch}
          onSelect={setSelectedUid}
          onNew={addNewLifecycle}
          onRemove={removeLifecycle}
          onAddMember={addTeamMember}
          onRemoveMember={removeTeamMember}
          addError={addMember.isError ? problemMessage(addMember.error) : null}
        />
      )}
    </div>
  );
}
