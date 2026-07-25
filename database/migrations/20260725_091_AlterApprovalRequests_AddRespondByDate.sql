-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 5, Approval respond-by)
-- Create Date: 2026-07-25
-- Description: Adds dbo.ApprovalRequests.RespondByDate — the date by which the frozen approvers are
--              expected to respond (BS §7 / §16). Stamped by usp_OpenGate at gate-open as
--              OpenedAt + Workspaces.ApprovalRespondByDays. Drives the built-in ApprovalOverdue trigger
--              (Slice 5): an open gate whose RespondByDate has passed notifies its eligible approvers.
--              NULLABLE — existing in-flight gates carry no respond-by (only newly-opened gates get one),
--              and the trigger candidate filter requires a non-null RespondByDate, so pre-existing rows
--              are naturally excluded. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.ApprovalRequests', N'RespondByDate') IS NULL
    ALTER TABLE dbo.ApprovalRequests ADD RespondByDate DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_091_AlterApprovalRequests_AddRespondByDate')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_091_AlterApprovalRequests_AddRespondByDate', SUSER_SNAME(), N'Slice 5 — ApprovalRequests.RespondByDate (approver respond-by).');
END;
GO
