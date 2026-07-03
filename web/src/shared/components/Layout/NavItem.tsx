// A sidebar nav item (design-system .mws-nav-item). Categorical items carry ONE leading marker
// — an icon, never also a number (navigation-and-ia.md). Rendered as a NavLink so it is a real
// <a href>, gets aria-current="page" when active (which drives the active styling), and closes
// the mobile drawer on click. An explicit aria-label keeps the accessible name when the label
// text is hidden on the collapsed rail (iconography.md — rail icons keep their name).

import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  to: string;
  icon: ComponentType<IconProps>;
  label: string;
  onNavigate?: () => void;
}

export function NavItem({ to, icon: Icon, label, onNavigate }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className="mws-nav-item"
      aria-label={label}
      title={label}
      onClick={onNavigate}
      data-ds="nav-item"
      end={to === '/'}
    >
      <Icon size={20} weight="regular" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
}
