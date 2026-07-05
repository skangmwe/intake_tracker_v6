# Notifications

Owns the in-app notification centre / bell (slice 12). `POST /notifications/query`,
`GET /notifications/unread-count`, `POST /notifications/mark-all-read`,
`POST /notifications/{id}/mark-read`. Every endpoint is caller-scoped; marking someone else's
notification read is a 403 that never discloses its existence. Fan-out is materialised **in-process**
on the event spine by `NotificationFanout` → `usp_FanOutNotification` (registered next to
`AuditWriter`) — the Worker/Service-Bus path stays documented but is a no-op in the dev/test stack.
Depends on: Event Spine, Watchers, ApproverTeamMembership, UserGroupMembership. See
module-boundaries.md § 16 / § 20.
