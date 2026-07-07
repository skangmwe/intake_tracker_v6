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

/**
 * Request body for POST /workspaces (Platform admin, R1 Phase 2 self-serve). Exactly one of
 * `initialAdminUserId` / `initialAdminEmail` identifies the first WorkspaceAdmin:
 *  - `initialAdminUserId` — a known user id (ops tooling / slice-19 path).
 *  - `initialAdminEmail` — resolve an active platform user server-side (unresolved / ambiguous → 400),
 *    mirroring the S29 membership add and S36 grant. The S38 wizard uses this — R1 has no user-directory
 *    endpoint, so a Platform admin types the admin's email rather than a raw id (slice 24 refinement).
 */
export interface WorkspaceProvisionRequest {
  name: string;
  /** Must be globally unique; validated against the platform PrefixRegistry. */
  prefix: string;
  initialAdminUserId?: UserId;
  initialAdminEmail?: string;
}

/**
 * Membership upsert — add a new member or change an existing member's level (S29).
 * Exactly one of `userId` / `email` must be supplied:
 *  - `userId` — change an existing member's level (or add a member already known by id).
 *  - `email` — resolve an active platform user by email and add/update their membership.
 *    Resolution mirrors the approver-team add (slice 4): unresolved / ambiguous → 400.
 * (Slice 17 refinement of the api-contracts §2 body — the R1 stack has no user-directory
 * endpoint, so the S29 "Add member" affordance resolves a typed email server-side.)
 */
export interface MembershipUpsertRequest {
  userId?: UserId;
  email?: string;
  level: AccessLevel;
}

/**
 * One row of the S29 Users & access members list — the caller-facing view of a
 * workspace member: SSO identity, their level in this workspace, last-active, and
 * whether the account is disabled (BS §4.2 / blueprint S29).
 */
export interface WorkspaceMemberDto {
  userId: UserId;
  /** PII — never logged (api-logging.md). */
  displayName: string;
  /** PII — never logged. */
  email: string;
  level: AccessLevel;
  isDisabled: boolean;
  /** Last authenticated request (Users.LastSignInAt). */
  lastActiveAt: IsoDateTime;
}

/** Response of GET /workspaces/{id}/members. */
export interface MembersListDto {
  members: WorkspaceMemberDto[];
}
