-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_031_CreateRequestCrossingSnapshot. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RequestCrossingSnapshot', N'U') IS NOT NULL
    DROP TABLE dbo.RequestCrossingSnapshot;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_031_CreateRequestCrossingSnapshot';
GO
