// Per-row overflow menu for a custom record (SP2) — the resting cell shows only the
// `dots-three-vertical` trigger; the menu holds View / Edit / Delete. Rendered through a portal with
// fixed positioning: the grid cell has `overflow: hidden` and the grid body has `overflow: auto`, so
// an in-flow popover would be clipped (same rationale as the members RowActionsMenu). Position is
// computed from the trigger rect (right-aligned, clamped to the viewport). Keyboard: Up/Down + Home/
// End move focus, Enter/Space activate, Escape closes. The trigger stops propagation so opening the
// menu never fires the row-click navigation.

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DotsThreeVertical, Eye, PencilSimple, Trash } from '@phosphor-icons/react';

const MENU_WIDTH = 200;
const VIEWPORT_MARGIN = 8;
const ICON_SIZE = 16;

interface RecordRowActionsProps {
  /** Record name — used to name the trigger and the menu accessibly. */
  recordLabel: string;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RecordRowActions({ recordLabel, onView, onEdit, onDelete }: RecordRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH),
      Math.max(VIEWPORT_MARGIN, maxLeft),
    );
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

  // On open, focus the first item so Up/Down work immediately (menu pattern).
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
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
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
        className="cr-kebab"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${recordLabel}`}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close();
          else openMenu();
        }}
      >
        <DotsThreeVertical size={20} weight="regular" aria-hidden />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            className="cr-row-menu"
            role="menu"
            aria-label={`Actions for ${recordLabel}`}
            ref={menuRef}
            tabIndex={-1}
            style={{ top: position.top, left: position.left }}
            onKeyDown={onMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              className="ast-menu__item"
              onClick={() => runAction(onView)}
            >
              <Eye size={ICON_SIZE} weight="regular" aria-hidden />
              View
            </button>
            <button
              type="button"
              role="menuitem"
              className="ast-menu__item"
              onClick={() => runAction(onEdit)}
            >
              <PencilSimple size={ICON_SIZE} weight="regular" aria-hidden />
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className="ast-menu__item cr-row-menu__danger"
              onClick={() => runAction(onDelete)}
            >
              <Trash size={ICON_SIZE} weight="regular" aria-hidden />
              Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
