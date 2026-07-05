# Announcements

Owns Announcement records and their publish/retire lifecycle (BS §2.7 / §20). Portable object,
seeded in the AI Solutions workspace first. Depends on: WorkspaceMembership (audience resolution),
ApproverTeamMembership (role-scoped audience), the Event Spine + Notifications (bell fan-out).
See module-boundaries.md § 9.

## Endpoints (api-contracts.md §12)

- `POST /api/v1/announcements/query` — the caller's Published, in-audience history (S22), across all
  their workspaces. Any member.
- `GET /api/v1/announcements/{id}` — detail (S21). Audience-gated; a caller who cannot see it gets
  `403`, never disclosing existence (BS §22.6).
- `POST /api/v1/workspaces/{workspaceId}/announcements` — create a Draft (WorkspaceAdmin).
- `POST /api/v1/workspaces/{workspaceId}/announcements/query` — the workspace's full list across all
  statuses (WorkspaceAdmin, S23).
- `PATCH /api/v1/announcements/{id}` — replace the editable fields; author-or-admin; a Retired
  announcement is immutable (`409`).
- `POST /api/v1/announcements/{id}/publish` — Draft→Published; emits `announcement.published` on the
  spine exactly once, whose fan-out delivers "Announcement posted" to the audience's bells.
- `POST /api/v1/announcements/{id}/retire` — soft retire; never a hard delete.

## Notes

- **Audience is stored as one JSON document** (`{ kind, roleLabels?, userIds? }`) on the row; the
  procs parse it. Audience never widens access (§10.2).
- **Publish fan-out is in-process** via the slice-12 `usp_FanOutNotification` (extended here with the
  `announcement.published` branch). The Notifications table gained a nullable `AnnouncementId` so a
  bell `announcement-posted` row deep-links to S21.
- **The pinned-Home strip is not built here** — it lands with the Home surface (slice 22).
