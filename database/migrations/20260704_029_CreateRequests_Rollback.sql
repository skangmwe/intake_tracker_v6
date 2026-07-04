-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_029_CreateRequests. Drops dbo.Requests and its
--              indexes. Idempotent (guarded by OBJECT_ID). Removes the migration-history row.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Requests', N'U') IS NOT NULL
    DROP TABLE dbo.Requests;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_029_CreateRequests';
GO
