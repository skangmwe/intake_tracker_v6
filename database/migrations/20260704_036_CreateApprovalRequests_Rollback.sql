-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_036_CreateApprovalRequests. Drops dbo.ApprovalRequests and its
--              indexes. Run AFTER the 037 (ApprovalDecisions) rollback — ApprovalDecisions FKs to
--              ApprovalRequests. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ApprovalRequests', N'U') IS NOT NULL
    DROP TABLE dbo.ApprovalRequests;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_036_CreateApprovalRequests';
GO
