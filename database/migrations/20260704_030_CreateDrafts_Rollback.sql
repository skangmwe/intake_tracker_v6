-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_030_CreateDrafts. Drops dbo.Drafts. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Drafts', N'U') IS NOT NULL
    DROP TABLE dbo.Drafts;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_030_CreateDrafts';
GO
