// Icon-only button (design-system .mws-iconbtn). 36×36 hit area; the visual icon is smaller.
// Always carries an accessible name via `label` (iconography.md — icon-only buttons need one).

import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';

interface IconButtonProps {
  icon: ComponentType<IconProps>;
  /** Accessible name — required. */
  label: string;
  onClick?: () => void;
  bordered?: boolean;
  size?: number;
  title?: string;
  ariaHasPopup?: 'menu' | 'dialog' | 'listbox' | 'true';
  ariaExpanded?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  bordered = false,
  size = 20,
  title,
  ariaHasPopup,
  ariaExpanded,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={bordered ? 'mws-iconbtn mws-iconbtn--bordered' : 'mws-iconbtn'}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      data-ds="icon-btn"
    >
      <Icon size={size} weight="regular" aria-hidden />
    </button>
  );
}
