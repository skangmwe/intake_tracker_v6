-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 5, Approval respond-by)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_091 — drop dbo.ApprovalRequests.RespondByDate. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.ApprovalRequests', N'RespondByDate') IS NOT NULL
    ALTER TABLE dbo.ApprovalRequests DROP COLUMN RespondByDate;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_091_AlterApprovalRequests_AddRespondByDate';
GO
