# Watchers

Owns per-record subscriptions (slice 12). `GET/POST/DELETE /api/v1/records/{id}/watchers`. Access is
resolved against the record's own workspace (`usp_GetRequestByIdForUser`) — a forbidden or
non-existent record is a 403, never 404. Subscribing/unsubscribing another user requires
WorkspaceAdmin; the prototype card only toggles the caller's own subscription. Provides the live
watcher list to the Notifications fan-out. Depends on: Requests. See module-boundaries.md § 11.
