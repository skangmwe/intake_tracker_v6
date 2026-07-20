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

/** Membership status shown in the S29 list — a real member's Active/Suspended, or a pending Invited. */
export type MemberStatus = 'Active' | 'Suspended' | 'Invited';

/**
 * One row of the S29 Users & access members list — a real member OR a pending invitation
 * (BS §4.2 / blueprint S29). For an invitation row `userId` / `displayName` / `lastActiveAt` are
 * null and `invitationId` is set (used by the cancel action); for a member row `invitationId` is null.
 */
export interface WorkspaceMemberDto {
  /** Null for a pending invitation (no account yet). */
  userId: UserId | null;
  /** PII — never logged (api-logging.md). Null for a pending invitation. */
  displayName: string | null;
  /** PII — never logged. */
  email: string;
  level: AccessLevel;
  isDisabled: boolean;
  /** Last authenticated request (Users.LastSignInAt). Null for a pending invitation. */
  lastActiveAt: IsoDateTime | null;
  status: MemberStatus;
  /** Set only on a pending-invitation row (the target of DELETE /workspaces/{id}/invitations/{id}). */
  invitationId: string | null;
}

/** Response of GET /workspaces/{id}/members. */
export interface MembersListDto {
  members: WorkspaceMemberDto[];
}

/** Outcome of POST /workspaces/{id}/members — joined now (`Member`) or invited (`Invited`). */
export type MembershipUpsertOutcome = 'Member' | 'Invited';

/** Response body of POST /workspaces/{id}/members. */
export interface MembershipUpsertResponse {
  outcome: MembershipUpsertOutcome;
}
