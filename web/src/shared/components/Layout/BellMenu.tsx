// Notifications bell (top bar). SLICE-2 STUB: the popover lists the sections the real bell
// centre will surface (S20 — Notifications + Announcement history). Live notifications land in
// slice 12.

import { useState } from 'react';
import { Bell, Megaphone } from '@phosphor-icons/react';

import { IconButton } from '@/shared/components/Button/IconButton';
import { useDismissable } from '@/shared/hooks/useDismissable';

export function BellMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLSpanElement>(open, () => setOpen(false));

  return (
    <span className="ast-menu-anchor" ref={ref}>
      <IconButton
        icon={Bell}
        label="Notifications"
        ariaHasPopup="menu"
        ariaExpanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="ast-menu" role="menu">
          <button type="button" role="menuitem" className="ast-menu__item" onClick={() => setOpen(false)}>
            <Bell size={18} weight="regular" aria-hidden />
            Notifications
          </button>
          <button type="button" role="menuitem" className="ast-menu__item" onClick={() => setOpen(false)}>
            <Megaphone size={18} weight="regular" aria-hidden />
            Announcement history
          </button>
        </div>
      )}
    </span>
  );
}
