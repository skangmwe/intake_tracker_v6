// The auth context surface both providers (MSAL and dev) expose. Components consume it via
// useAuth() and never touch MSAL directly — token acquisition is wired into the api client
// by the provider, not read here.

import { createContext, useContext } from 'react';

export interface AuthUser {
  name: string;
  username: string;
  /** Up-to-two-letter initials for the account avatar. */
  initials: string;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return value;
}

/** Derive up-to-two-letter initials from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
