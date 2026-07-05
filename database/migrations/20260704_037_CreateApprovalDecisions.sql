-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Creates dbo.ApprovalDecisions — one row per sign-off/rejection on a frozen slot
--              (data-model.md §ApprovalDecision, BS §7.2 / §7.3). A slot's CURRENT decision is its
--              latest row with SupersededAt IS NULL; a new decision supersedes the prior one, so
--              there is at most one live decision per slot. Re-requesting a rejected slot
--              (usp_ReRequestApproval) supersedes the rejection and returns the slot to pending —
--              the historical rejection row is retained (visible as "Rejected · signer · time" +
--              comment), never mutated or deleted.
--
--              Rejection requires a comment (blueprint / changelog rule): CK_ApprovalDecisions_
--              RejectNeedsComment enforces it at the DB as the backstop; the API returns
--              400 rejection-requires-comment first. IsProxy marks an off-platform sign-off recorded
--              by a workspace admin (BS §7.3). Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ApprovalDecisions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApprovalDecisions
    (
        DecisionId        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ApprovalDecisions_Id DEFAULT NEWSEQUENTIALID(),
        ApprovalRequestId UNIQUEIDENTIFIER NOT NULL,
        -- Ordinal into the frozen slot snapshot on the parent ApprovalRequest.
        SlotIndex         INT              NOT NULL,
        Decision          NVARCHAR(16)     NOT NULL,
        -- The name the acting team member picked from "Select your name". Real workspace user.
        DecidedByUserId   UNIQUEIDENTIFIER NOT NULL,
        DecidedAt         DATETIME2        NOT NULL CONSTRAINT DF_ApprovalDecisions_DecidedAt DEFAULT SYSUTCDATETIME(),
        -- Required when Decision = Rejected. Confidential free-text — never logged (api-pii-handling.md).
        Comment           NVARCHAR(MAX)    NULL,
        -- Off-platform sign-off recorded by an admin (BS §7.3).
        IsProxy           BIT              NOT NULL CONSTRAINT DF_ApprovalDecisions_IsProxy DEFAULT 0,
        -- Set when a later decision (or a re-request) replaces this one as the slot's live decision.
        SupersededAt      DATETIME2        NULL,

        CreatedAt         DATETIME2        NOT NULL CONSTRAINT DF_ApprovalDecisions_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt         DATETIME2        NOT NULL CONSTRAINT DF_ApprovalDecisions_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy         NVARCHAR(256)    NOT NULL,
        UpdatedBy         NVARCHAR(256)    NOT NULL,
        IsDeleted         BIT              NOT NULL CONSTRAINT DF_ApprovalDecisions_IsDeleted DEFAULT 0,
        DeletedAt         DATETIME2        NULL,

        CONSTRAINT PK_ApprovalDecisions PRIMARY KEY CLUSTERED (DecisionId),
        CONSTRAINT FK_ApprovalDecisions_ApprovalRequests FOREIGN KEY (ApprovalRequestId)
            REFERENCES dbo.ApprovalRequests (ApprovalRequestId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ApprovalDecisions_Users FOREIGN KEY (DecidedByUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_ApprovalDecisions_Decision CHECK (Decision IN (N'Approved', N'Rejected')),
        -- Rejection requires a non-empty comment (backstop; the API returns 400 first).
        CONSTRAINT CK_ApprovalDecisions_RejectNeedsComment CHECK (
            Decision = N'Approved' OR (Comment IS NOT NULL AND LEN(LTRIM(RTRIM(Comment))) > 0))
    );
END;
GO

-- FK / read index: current-decision-per-slot lookups filter by request + slot, latest first.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApprovalDecisions_Request_Slot' AND object_id = OBJECT_ID(N'dbo.ApprovalDecisions'))
    CREATE NONCLUSTERED INDEX IX_ApprovalDecisions_Request_Slot
        ON dbo.ApprovalDecisions (ApprovalRequestId, SlotIndex, DecidedAt) WHERE IsDeleted = 0;
GO

-- FK index on DecidedByUserId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApprovalDecisions_DecidedByUserId' AND object_id = OBJECT_ID(N'dbo.ApprovalDecisions'))
    CREATE NONCLUSTERED INDEX IX_ApprovalDecisions_DecidedByUserId ON dbo.ApprovalDecisions (DecidedByUserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_037_CreateApprovalDecisions')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_037_CreateApprovalDecisions', SUSER_SNAME(), N'Slice 8 — ApprovalDecisions (append-only slot decisions, reject-needs-comment).');
END;
GO
