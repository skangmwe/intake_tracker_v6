-- =============================================
-- Author:      /dev-build-application (Slice 26 — per-record notification preferences)
-- Create Date: 2026-07-17
-- Description: Rollback for 20260717_062_CreateWatcherNotificationPreference. Drops the
--              table and removes the migration history row. Idempotent.
--
--              Rolling back 062 also rolls back any data written by 063
--              (BackfillWatcherPreferencesFromWatchers) and any preferences the app has
--              written since — soft-delete is not preserved on a drop. If preserving is
--              required, disable the app's write path first, snapshot the rows, roll back,
--              and restore from snapshot.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.WatcherNotificationPreference', N'U') IS NOT NULL
    DROP TABLE dbo.WatcherNotificationPreference;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260717_062_CreateWatcherNotificationPreference';
GO
