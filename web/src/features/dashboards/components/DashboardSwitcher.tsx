// The dashboard switcher header (S6 multi-dashboard, slice 28): a Georgia title that opens a
// Shared / Personal dropdown of the workspace's dashboards, plus Pin-as-home, an Edit-layout toggle
// (composed dashboards only), and a New-dashboard action. Picking an item switches the surface;
// "New dashboard" opens the compose sheet. Keyboard: the trigger toggles the menu, Escape and an
// outside click close it, and every item is a real button.

import { useEffect, useRef, useState } from 'react';
import { CaretDown, Check, Plus } from '@phosphor-icons/react';

import type { DashboardListItemDto, SavedDashboardDto, SavedDashboardId } from '@shared/types';

import { Button } from '@/shared/components/Button';

import { DashPinButton } from './DashPinButton';

interface DashboardSwitcherProps {
  active: SavedDashboardDto;
  dashboards: DashboardListItemDto[];
  onPick: (dashboardId: SavedDashboardId) => void;
  onNew: () => void;
  editing: boolean;
  onToggleEditing: () => void;
}

function itemMeta(item: DashboardListItemDto): string {
  if (item.isDefault) return 'Default';
  return item.visibility ?? 'Shared';
}

export function DashboardSwitcher({
  active,
  dashboards,
  onPick,
  onNew,
  editing,
  onToggleEditing,
}: DashboardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A missing visibility (pre-v2 fixture) groups as Shared; the API always sends it.
  const personal = dashboards.filter((item) => item.visibility === 'Personal');
  const shared = dashboards.filter((item) => item.visibility !== 'Personal');
  const isEditable = active.layoutMode === 'Composed' && !active.isSeeded;

  const pick = (dashboardId: SavedDashboardId) => {
    setOpen(false);
    onPick(dashboardId);
  };

  const renderGroup = (label: string, items: DashboardListItemDto[]) =>
    items.length > 0 && (
      <>
        <div className="dash-switcher__group">{label}</div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="dash-switcher__item"
            onClick={() => pick(item.id)}
          >
            <span className="dash-switcher__check" aria-hidden>
              {item.id === active.id && <Check size={14} weight="bold" />}
            </span>
            <span className="dash-switcher__item-name">{item.name}</span>
            <span className="dash-switcher__item-meta">{itemMeta(item)}</span>
          </button>
        ))}
      </>
    );

  return (
    <div className="dash-switcher" data-ds="dashboard-switcher">
      <span className="dash-switcher__anchor" ref={menuRef}>
        <button
          type="button"
          id="dash-heading"
          className="dash-switcher__title"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {active.name}
          <CaretDown size={20} weight="regular" aria-hidden />
        </button>
        {open && (
          <div className="dash-switcher__menu" role="menu">
            {renderGroup('Shared', shared)}
            {renderGroup('Personal', personal)}
            <div className="dash-switcher__menu-footer">
              <button type="button" role="menuitem" className="dash-switcher__new" onClick={onNew}>
                <Plus size={14} weight="regular" aria-hidden /> New dashboard
              </button>
            </div>
          </div>
        )}
      </span>

      <DashPinButton />

      <span className="dash-switcher__meta">
        {[active.isDefault ? 'Default' : null, active.visibility ?? 'Shared']
          .filter(Boolean)
          .join(' · ')}
      </span>

      <span className="dash-switcher__spacer" />

      {isEditable && (
        <Button variant="secondary" onClick={onToggleEditing}>
          {editing ? 'Done editing' : 'Edit layout'}
        </Button>
      )}
      <Button variant="primary" onClick={onNew}>
        <Plus size={16} weight="regular" aria-hidden /> New dashboard
      </Button>
    </div>
  );
}
