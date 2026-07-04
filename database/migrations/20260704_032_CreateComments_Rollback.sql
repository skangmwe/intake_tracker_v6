-- =============================================
-- Author:      /dev-build-application (Slice 6 — Comments & activity thread)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_032_CreateComments. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.trg_Comments_PreventMutation', N'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_Comments_PreventMutation;
GO

IF OBJECT_ID(N'dbo.Comments', N'U') IS NOT NULL
    DROP TABLE dbo.Comments;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_032_CreateComments';
GO
