// Workspace switcher (sidebar). SLICE-2 STUB: it lists the caller's memberships from
// GET /users/me and marks the first as current; picking one just closes the menu. The full
// switching flow (active-workspace context, scoped queries) is a later iteration — S8 is
// tagged [deferred] in the slice plan.

import { useState } from 'react';
import { Buildings, CaretUpDown, Check } from '@phosphor-icons/react';
import type { WorkspaceKind, WorkspaceMembershipDto } from '@shared/types';

import { useDismissable } from '@/shared/hooks/useDismissable';

const KIND_LABEL: Record<WorkspaceKind, string> = {
  'ai-solutions': 'hub',
  'pg-dept': 'PG/Dept',
  'pg-dept-template': 'template',
};

interface WorkspaceSwitcherProps {
  memberships: WorkspaceMembershipDto[];
}

export function WorkspaceSwitcher({ memberships }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  const current = memberships[0];
  const currentLabel = current ? current.workspaceName : 'No workspace';

  return (
    <div className="ast-ws-switch" ref={ref}>
      <button
        type="button"
        className="ast-ws-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch workspace — ${currentLabel}`}
        onClick={() => setOpen((value) => !value)}
        title={`Switch workspace — ${currentLabel}`}
      >
        <Buildings size={16} weight="regular" aria-hidden />
        <span className="ast-ws-text">
          {currentLabel}
          {current && <span className="ast-ws-text-kind"> · {KIND_LABEL[current.workspaceKind]}</span>}
        </span>
        <CaretUpDown className="ast-ws-caret" size={14} weight="regular" aria-hidden />
      </button>
      {open && (
        <div className="ast-ws-menu" role="menu" aria-label="Your workspaces">
          <div className="ast-ws-menu__label">Your workspaces</div>
          {memberships.length === 0 && (
            <div className="ast-ws-empty">You are not a member of any workspace yet.</div>
          )}
          {memberships.map((membership, index) => (
            <button
              key={membership.workspaceId}
              type="button"
              role="menuitem"
              className="ast-ws-menu__item"
              onClick={() => setOpen(false)}
            >
              {index === 0 ? (
                <Check size={14} weight="regular" aria-hidden />
              ) : (
                <span aria-hidden className="ast-ws-menu__item-spacer" />
              )}
              <span className="ast-ws-menu__item-name">{membership.workspaceName}</span>
              <span className="ast-ws-menu__item-kind">{KIND_LABEL[membership.workspaceKind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
