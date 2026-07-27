// Workspace switcher (sidebar). Lists the caller's memberships from GET /users/me; the current
// selection and the click handler are backed by the ActiveWorkspaceContext, so picking a
// workspace here sets it as active app-wide and persists the choice.
//
// The popover is portalled to <body> and positioned at the trigger so it can extend past the
// sidebar's right edge (the sidebar is a scroll container that would otherwise clip it) and grow
// to fit the full workspace name — no truncation. The PG/Dept *template* is a clone-source, not a
// workspace you work in, so it is filtered out of the switcher (the workspace itself stays in the
// product; it is just not offered here).

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Buildings, CaretUpDown, Check } from '@phosphor-icons/react';
import type { WorkspaceKind, WorkspaceMembershipDto } from '@shared/types';

import { useDismissable } from '@/shared/hooks/useDismissable';
import { useActiveWorkspace } from '@/shared/workspace/ActiveWorkspaceContext';

const KIND_LABEL: Record<WorkspaceKind, string> = {
  'ai-solutions': 'hub',
  'pg-dept': 'PG/Dept',
  'pg-dept-template': 'template',
};

interface MenuPosition {
  top: number;
  left: number;
  minWidth: number;
}

interface WorkspaceSwitcherProps {
  memberships: WorkspaceMembershipDto[];
}

export function WorkspaceSwitcher({ memberships }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapRef = useDismissable<HTMLDivElement>(open, () => setOpen(false), menuRef);

  // The PG/Dept template is a clone source, not a switchable workspace — never list it.
  const workspaces = memberships.filter((item) => item.workspaceKind !== 'pg-dept-template');
  const { activeWorkspaceId, setActiveWorkspaceId } = useActiveWorkspace();
  const current =
    workspaces.find((item) => item.workspaceId === activeWorkspaceId) ?? workspaces[0];
  const currentLabel = current ? current.workspaceName : 'No workspace';

  // Anchor the portalled popover to the trigger, and keep it aligned on scroll/resize.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!open || !button) return;

    const reposition = () => {
      const rect = button.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  return (
    <div className="ast-ws-switch" ref={wrapRef}>
      <button
        ref={buttonRef}
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
      {open &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="ast-ws-menu"
            role="menu"
            aria-label="Your workspaces"
            style={{ top: menuPosition.top, left: menuPosition.left, minWidth: menuPosition.minWidth }}
          >
            <div className="ast-ws-menu__label">Your workspaces</div>
            {workspaces.length === 0 && (
              <div className="ast-ws-empty">You are not a member of any workspace yet.</div>
            )}
            {workspaces.map((membership) => {
              const isActive = membership.workspaceId === activeWorkspaceId;
              return (
                <button
                  key={membership.workspaceId}
                  type="button"
                  role="menuitem"
                  className="ast-ws-menu__item"
                  onClick={() => {
                    setActiveWorkspaceId(membership.workspaceId);
                    setOpen(false);
                  }}
                >
                  {isActive ? (
                    <Check size={14} weight="regular" aria-hidden />
                  ) : (
                    <span aria-hidden className="ast-ws-menu__item-spacer" />
                  )}
                  <span className="ast-ws-menu__item-name">{membership.workspaceName}</span>
                  <span className="ast-ws-menu__item-kind">{KIND_LABEL[membership.workspaceKind]}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
