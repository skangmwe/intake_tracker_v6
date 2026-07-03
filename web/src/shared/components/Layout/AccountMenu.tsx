// Account menu (top bar). Avatar of the signed-in caller's initials; opens a popover with the
// account header + Profile (stub) and Sign out (real — calls the auth layer's logout).

import { useState } from 'react';
import { SignOut, User } from '@phosphor-icons/react';

import { useAuth } from '@/shared/auth/authContext';
import { useDismissable } from '@/shared/hooks/useDismissable';

export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLSpanElement>(open, () => setOpen(false));

  if (!user) return null;

  return (
    <span className="ast-menu-anchor" ref={ref}>
      <button
        type="button"
        className="ast-account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account — ${user.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        {user.initials}
      </button>
      {open && (
        <div className="ast-menu" role="menu">
          <div className="ast-account__header">
            <span className="ast-account__avatar" aria-hidden>
              {user.initials}
            </span>
            <span className="ast-account__meta">
              <span className="ast-account__name">{user.name}</span>
              <span className="ast-account__role">{user.username}</span>
            </span>
          </div>
          <button type="button" role="menuitem" className="ast-menu__item" onClick={() => setOpen(false)}>
            <User size={18} weight="regular" aria-hidden />
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="ast-menu__item"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <SignOut size={18} weight="regular" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </span>
  );
}
