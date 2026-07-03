// Identity, workspace, and access — the vocabulary of who and where.

import type {
  AccessLevel,
  IsoDateTime,
  SavedDashboardId,
  ThemePreference,
  UserId,
  WorkspaceId,
  WorkspaceKind,
} from './common';

/**
 * A user record — provisioned automatically by EnsureUserMiddleware on first
 * authenticated request. Clients never call a /register endpoint.
 */
export interface UserDto {
  id: UserId;
  /** Human-readable name — PII. Never logged (api-logging.md). */
  displayName: string;
  /** Email / preferred_username claim — PII. Never logged. */
  email: string;
  lastSignInAt: IsoDateTime;
  isDisabled: boolean;
  /** Server-persisted UI theme preference. Seeds `localStorage` on a fresh device. */
  theme: ThemePreference;
}

/** Request body for POST /users/me/theme. */
export interface ThemeUpdateRequest {
  theme: ThemePreference;
}

/**
 * The workspace the caller currently has open, plus each membership's level.
 * Returned by GET /users/me.
 */
export interface MeDto {
  user: UserDto;
  memberships: WorkspaceMembershipDto[];
  /** Additive firm-wide grant — not an access level. */
  isPlatformAdmin: boolean;
  /** Present when the caller is bound to a single dashboard as sole surface. */
  boundDashboardId?: SavedDashboardId;
}

export interface WorkspaceMembershipDto {
  workspaceId: WorkspaceId;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  workspacePrefix: string;
  level: AccessLevel;
  isDashboardViewer: boolean;
  boundDashboardId?: SavedDashboardId;
}

/** Public workspace summary for the switcher. */
export interface WorkspaceListItem {
  id: WorkspaceId;
  name: string;
  kind: WorkspaceKind;
  prefix: string;
  level: AccessLevel;
}

export interface WorkspaceDto extends WorkspaceListItem {
  createdAt: IsoDateTime;
  retiredAt?: IsoDateTime;
}

/** Request body for POST /workspaces (Platform admin, R1 Phase 2 self-serve). */
export interface WorkspaceProvisionRequest {
  name: string;
  /** Must be globally unique; validated against the platform PrefixRegistry. */
  prefix: string;
  initialAdminUserId: UserId;
}

/** Membership upsert — add or change level. */
export interface MembershipUpsertRequest {
  userId: UserId;
  level: AccessLevel;
}
