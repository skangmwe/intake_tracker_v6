-- =============================================
-- Author:      /dev-build-application (Slice 26 — Record Status/hold model)
-- Create Date: 2026-07-17
-- Description: STRUCTURAL migration. Adds the tri-state Status/hold columns to dbo.Requests
--              (v2-reconciliation.md §Model deltas 3):
--
--                StatusHold      NVARCHAR(20) NOT NULL DEFAULT 'InProgress'
--                                CHECK IN ('InProgress', 'OnHold', 'Abandoned')
--                StatusHoldNote  NVARCHAR(500) NULL
--
--              Divergence resolved (Slice 26 cut plan D1): the pre-Slice-26 hold state
--              lived inside FieldValues JSON keys (`$.holdBlocked`, `$.holdReason`) —
--              never a dedicated column. This migration ADDS the columns; the backfill
--              (from JSON → column) is a separate DATA migration (061). The JSON keys
--              are left in place and mirrored on write so the condition engine's
--              Display/Mirror Status derivation continues to see them (same pattern
--              usp_SetRequestStage uses for `$.stage`).
--
--              Semantics (v2-reconciliation.md §Model deltas 3):
--                - InProgress → the working state; tasks complete and gates advance
--                  normally.
--                - OnHold     → pauses task completion (usp_PatchTask on
--                  Status→Complete) and gate approvals (usp_SubmitDecision) and stage
--                  advance (usp_SetRequestStage). Reactivating returns to InProgress.
--                - Abandoned  → blocks the same three transitions. Reopens by
--                  transitioning back to InProgress via the Status tab.
--
--              Idempotent — the column/constraint adds are guarded on NOT EXISTS.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Requests') AND name = N'StatusHold')
BEGIN
    ALTER TABLE dbo.Requests
        ADD StatusHold NVARCHAR(20) NOT NULL
            CONSTRAINT DF_Requests_StatusHold DEFAULT (N'InProgress');
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Requests') AND name = N'StatusHoldNote')
BEGIN
    ALTER TABLE dbo.Requests
        ADD StatusHoldNote NVARCHAR(500) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.Requests') AND name = N'CK_Requests_StatusHold')
BEGIN
    ALTER TABLE dbo.Requests
        ADD CONSTRAINT CK_Requests_StatusHold
            CHECK (StatusHold IN (N'InProgress', N'OnHold', N'Abandoned'));
END;
GO

-- StatusHold is a low-cardinality workspace-scoped filter (Home queue, S2 pill rendering)
-- so a filtered index on the non-active values keeps held-record queries fast without
-- inflating the InProgress index (95%+ of rows expected to be InProgress).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Requests_Workspace_StatusHold' AND object_id = OBJECT_ID(N'dbo.Requests'))
    CREATE NONCLUSTERED INDEX IX_Requests_Workspace_StatusHold
        ON dbo.Requests (WorkspaceId, StatusHold)
        WHERE IsDeleted = 0 AND StatusHold <> N'InProgress';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260717_060_AlterRequests_AddStatusHold')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260717_060_AlterRequests_AddStatusHold', SUSER_SNAME(),
            N'Slice 26 — add StatusHold tri-state + StatusHoldNote columns on Requests.');
END;
GO
