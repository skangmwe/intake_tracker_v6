-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers + Notifications)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_040_CreateWatchers. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Watchers', N'U') IS NOT NULL
    DROP TABLE dbo.Watchers;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_040_CreateWatchers';
GO
