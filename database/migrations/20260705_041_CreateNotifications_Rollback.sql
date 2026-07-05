-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers + Notifications)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_041_CreateNotifications. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Notifications', N'U') IS NOT NULL
    DROP TABLE dbo.Notifications;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_041_CreateNotifications';
GO
