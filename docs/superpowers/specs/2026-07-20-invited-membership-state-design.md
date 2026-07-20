# Invited membership state — design

**Date:** 2026-07-20
**Screen:** S29 Users & access
**Layers:** database + API + web (one slice)
**Branch:** `slice/invited-membership-state`

## Problem

The prototype's S29 Users & access members list shows three statuses — **Active**,
**Invited**, **Suspended** — but the backend only models Active/Suspended
(`WorkspaceMembership.IsDisabled`). Adding a member today requires the email to
resolve to an existing, already-signed-in platform user (`usp_UpsertWorkspaceMembership`
throws `50020` on an unknown email). So there is no way to represent a person who has
been invited but has not yet signed in. This slice adds a true "Invited" state.

## Model (approved)

- **Invite by email** from the existing Add-member form. On submit:
  - Email **resolves to an existing platform user** → they join **immediately as
    Active** (today's path, unchanged).
  - Email is **unknown** (no `dbo.Users` row) → record a **pending invitation**
    (status `Invited`) instead of returning `400`.
- **Auto-accept on first sign-in:** the existing first-sign-in provisioning step
  (`EnsureUserMiddleware` → its provisioning proc) matches pending invitations by the
  new user's email (`preferred_username`) and converts them into active memberships.
  Atomic inside the provisioning proc → reliable + idempotent. No manual accept step.
- **No emails** — R1 has no mail infrastructure. The invitation is status-only.
- The members list becomes a **union**: real memberships (Active/Suspended) **+**
  pending invitations (Invited).

## Data

New table **`dbo.WorkspaceInvitation`** (standard conventions — INT identity PK,
six audit columns, soft-delete):

| Column | Type | Notes |
|---|---|---|
| `InvitationId` | `INT IDENTITY` PK | |
| `WorkspaceId` | `UNIQUEIDENTIFIER` FK → Workspace | indexed |
| `Email` | `NVARCHAR(320)` | the invited email (as typed, trimmed) |
| `Level` | `NVARCHAR(32)` | Viewer / Member / WorkspaceAdmin (CK constraint) |
| `Status` | `NVARCHAR(16)` | Invited / Accepted / Cancelled (CK constraint) |
| `InvitedBy` | `UNIQUEIDENTIFIER` | inviting admin's UserId |
| `AcceptedAt` | `DATETIME2` NULL | set when converted to a membership |
| six audit cols + `IsDeleted`/`DeletedAt` | | per `database-coding-standards.md` |

- Unique **filtered** index `(WorkspaceId, Email) WHERE Status='Invited' AND IsDeleted=0`
  → at most one live invite per email per workspace.
- Non-clustered index on `WorkspaceId` FK and on `Email` (accept-by-email lookup).

*Rejected alternative:* store invites as memberships with a null `UserId` — the
`WorkspaceMembership.UserId` FK to `dbo.Users` cannot be null for a person with no
account. A dedicated table is cleaner.

## Procedures

- **`usp_InviteOrAddMember`** (evolves `usp_UpsertWorkspaceMembership`): given
  `@WorkspaceId, @Email, @Level` — resolve email to an active user; if resolved →
  upsert an Active membership (existing behaviour, returns outcome `Added`); if
  unresolved → insert an `Invited` invitation (returns outcome `Invited`); duplicate
  live invite → `THROW` mapped to `409`.
- **Provisioning proc** (called by `EnsureUserMiddleware`): after upserting the
  `dbo.Users` row, accept all pending invitations `WHERE Email = @Email AND
  Status='Invited'` — insert the corresponding `WorkspaceMembership` (Level from the
  invite) and mark the invitation `Accepted` (`AcceptedAt = SYSUTCDATETIME()`). Idempotent.
- **`usp_CancelInvitation`**: soft-cancel a pending invite (`Status='Cancelled'`),
  workspace-admin only, audited.
- **`usp_ListWorkspaceMembers`**: return the **union** — memberships (with a derived
  status Active/Suspended) plus pending invitations (status Invited, no user/last-active).

## API

- **Add-member endpoint**: unknown email now yields outcome `Invited` (`201`/`200`) instead of
  `400`; known email still adds Active. Duplicate live invite → `409` ProblemDetails.
- **Cancel-invitation endpoint**: `DELETE /workspaces/{workspaceId}/invitations/{invitationId}`
  (soft-cancel); WorkspaceAdmin-gated → `403` otherwise; unknown/other-workspace invite → `403`
  (never `404`).
- **Acceptance**: folded into the provisioning proc — no controller work.
- **DTO**: `WorkspaceMemberDto` gains `status: 'Active' | 'Suspended' | 'Invited'` and an
  optional `invitationId` (present on invited rows only). For invited rows `userId` /
  `displayName` / `lastActiveAt` are null. `isDisabled` stays on the DTO, still populated
  (Active/Suspended rows), so existing consumers are untouched; the web reads the new `status`
  field.

## Web

- **MembersTable** Status column renders an **Invited** badge (`StatusPill status="warning"`,
  pale-gold, navy text — the prototype's status tone) beside Active/Suspended. Invited rows
  show the email as the identifier, an em-dash for last active, and a **Cancel invitation**
  action (in place of Deactivate).
- **AddMemberForm** no longer treats an unknown email as an error — on the `Invited` outcome it
  confirms "Invited {email}". Helper text updates ("They'll join automatically when they first
  sign in"). Level select unchanged.
- Hooks/api: add a `cancelInvitation` mutation; `useMembers` handles the union rows; the add
  mutation surfaces the `Added` vs `Invited` outcome.

## Scope boundaries (YAGNI — not in this slice)

- **No emails / no "Resend invitation"** (mail infra is out of R1; a no-op button would
  mislead). **No edit-level-before-accept.** **Cancel** is the only invited-row action.
  These can be added later if wanted.

## Testing

- **DB (tSQLt):** `usp_InviteOrAddMember` (known → Active, unknown → Invited, duplicate →
  error); provisioning-proc acceptance (pending invite → membership + Accepted; idempotent;
  no-match no-op); `usp_CancelInvitation`; `usp_ListWorkspaceMembers` union shape.
- **API (xUnit):** invite unknown email → Invited; invite known email → Active; duplicate →
  `409`; cancel non-owner → `403`; list returns union; acceptance on first sign-in
  (integration).
- **Web (jest + jest-axe):** Invited badge renders; add-unknown-email confirms invited (not
  error); Cancel invitation action; each rendered state under axe.

## Tiering

Stays **Tier 1** — no new integration, no external system, no mail. Pure SQL + API + web on
the existing stack. Acceptance rides the existing provisioning middleware.
