// S29 members row-action menu — the kebab overflow (data-visualization.md row-actions): the resting
// cell shows only the `dots-three-vertical` trigger; the menu holds the status-dependent actions:
//   • Active    → Edit details · Suspend member · Remove from workspace
//   • Suspended → Edit details · Reactivate · Remove from workspace
//   • Invited   → Cancel invitation (no account yet)
// Each action closes the menu; confirmation / editing happens in the surface it opens (the Edit and
// Remove dialogs). The menu is rendered through a portal with fixed positioning: the grid cell it
// lives in has `overflow: hidden` and the grid body has `overflow: auto`, so an in-flow popover would
// be clipped. Position is computed from the trigger's rect (right-aligned, flipped above with no room
// below) and clamped to the viewport. Keyboard: Up/Down + Home/End move focus, Enter/Space activate,
// Escape closes.

import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DotsThreeVertical } from '@phosphor-icons/react';

import type { MemberStatus } from '@shared/types';

const MENU_WIDTH = 220;
const VIEWPORT_MARGIN = 8;

interface RowActionsMenuProps {
  /** Person the menu acts on — used to name the trigger and the menu accessibly. */
  memberLabel: string;
  status: MemberStatus;
  onEditDetails: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onRemove: () => void;
  onCancelInvitation: () => void;
}

export function RowActionsMenu({
  memberLabel,
  status,
  onEditDetails,
  onSuspend,
  onReactivate,
  onRemove,
  onCancelInvitation,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Right-align the menu to the trigger, then clamp within the viewport so the far-right kebab
    // does not push it off-screen.
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH), Math.max(VIEWPORT_MARGIN, maxLeft));
    setPosition({ top: rect.bottom + 4, left });
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setPosition(null);
    triggerRef.current?.focus();
  };

  const runAction = (action: () => void) => {
    action();
    close();
  };

  // Flip above the trigger when the menu would overrun the viewport bottom (and there is room above).
  useLayoutEffect(() => {
    if (!open || !position || !menuRef.current || !triggerRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const aboveTop = triggerRect.top - menuRect.height - 4;
    if (menuRect.bottom > window.innerHeight - VIEWPORT_MARGIN && aboveTop > VIEWPORT_MARGIN) {
      if (Math.abs(position.top - aboveTop) > 1) setPosition({ top: aboveTop, left: position.left });
    }
  }, [open, position]);

  // On open, move focus to the first item so Up/Down arrows work immediately (menu pattern).
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  // Dismiss on outside pointer-down, Escape, or any scroll/resize (the fixed position would go stale).
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setPosition(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onReflow = () => {
      setOpen(false);
      setPosition(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="users-access__kebab"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${memberLabel}`}
        onClick={() => (open ? close() : openMenu())}
      >
        <DotsThreeVertical size={20} weight="regular" aria-hidden />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            className="users-access__row-menu"
            role="menu"
            aria-label={`Actions for ${memberLabel}`}
            ref={menuRef}
            tabIndex={-1}
            style={{ top: position.top, left: position.left }}
            onKeyDown={onMenuKeyDown}
          >
            {status !== 'Invited' && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="ast-menu__item"
                  onClick={() => runAction(onEditDetails)}
                >
                  Edit details
                </button>
                {status === 'Active' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="ast-menu__item"
                    onClick={() => runAction(onSuspend)}
                  >
                    Suspend member
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="ast-menu__item"
                    onClick={() => runAction(onReactivate)}
                  >
                    Reactivate
                  </button>
                )}
                <span className="users-access__menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="ast-menu__item"
                  onClick={() => runAction(onRemove)}
                >
                  Remove from workspace
                </button>
              </>
            )}

            {status === 'Invited' && (
              <button
                type="button"
                role="menuitem"
                className="ast-menu__item"
                onClick={() => runAction(onCancelInvitation)}
              >
                Cancel invitation
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
