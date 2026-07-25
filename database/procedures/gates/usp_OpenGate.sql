-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Opens a gate on a record (BS §7.2). Freezes the gate's approver slots — each slot's
--              team/role label plus the members currently eligible (resolved live from
--              ApproverTeamMembership) — into FrozenApproverSet, snapshots the gate name and the
--              from→to transition (keys drive the eventual advance; labels drive the "fires on
--              Build → QA" pill), and inserts the ApprovalRequest in the Pending state. At most one
--              unresolved gate may exist per record: the pre-check THROWs 50051 (→ 409
--              gate-already-open) and the filtered UNIQUE index is the race backstop.
--
--              Access-gated on the caller's membership (defence in depth — the API already gated the
--              record). A caller with no membership inserts nothing and gets an empty result set
--              (→ 403). Returns the created gate via vw_ApprovalRequestDetail.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_OpenGate
    @RecordId         NVARCHAR(20),
    @WorkspaceId      UNIQUEIDENTIFIER,
    @GateDefinitionId UNIQUEIDENTIFIER,
    @OpenedByUserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Gate   UNIQUEIDENTIFIER = @GateDefinitionId;
    DECLARE @By     UNIQUEIDENTIFIER = @OpenedByUserId;
    DECLARE @ByText NVARCHAR(256)    = CAST(@OpenedByUserId AS NVARCHAR(256));

    -- Access gate: the record must exist on a workspace the caller is a member of.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @By AND m.IsDeleted = 0
        WHERE r.RecordId = @Record AND r.WorkspaceId = @Ws AND r.IsDeleted = 0)
        RETURN;

    DECLARE @NewId UNIQUEIDENTIFIER = NEWID();

    -- Stamp the approver respond-by window (RespondByDate = OpenedAt + Workspaces.ApprovalRespondByDays).
    -- The column is NOT NULL DEFAULT 5, so the workspace (guaranteed to exist by the access gate) always
    -- yields a concrete window; the ISNULL is defence in depth against a missing row.
    DECLARE @OpenedAt DATETIME2 = SYSUTCDATETIME();
    DECLARE @Days     INT;
    SELECT @Days = ApprovalRespondByDays FROM dbo.Workspaces WHERE WorkspaceId = @Ws;
    DECLARE @RespondBy DATE = DATEADD(DAY, ISNULL(@Days, 5), CAST(@OpenedAt AS DATE));

    BEGIN TRY
        BEGIN TRANSACTION;

        -- One unresolved gate per record (a gate blocks further advances). 50051 → 409.
        IF EXISTS (
            SELECT 1 FROM dbo.ApprovalRequests WITH (UPDLOCK, HOLDLOCK)
            WHERE RequestRecordId = @Record AND WorkspaceId = @Ws
              AND State <> N'Resolved' AND IsDeleted = 0)
            THROW 50051, N'usp_OpenGate: a gate is already open on this record.', 1;

        -- Snapshot the gate config (name + transition keys/labels).
        DECLARE @GateName NVARCHAR(200), @FromKey NVARCHAR(64), @ToKey NVARCHAR(64),
                @FromLabel NVARCHAR(120), @ToLabel NVARCHAR(120);

        SELECT @GateName = g.Name,
               @FromKey  = fs.StageKey, @ToKey  = ts.StageKey,
               @FromLabel = fs.Label,   @ToLabel = ts.Label
        FROM dbo.GateDefinition AS g
        INNER JOIN dbo.StageDefinition AS fs ON fs.StageDefinitionId = g.FromStageId AND fs.IsDeleted = 0
        INNER JOIN dbo.StageDefinition AS ts ON ts.StageDefinitionId = g.ToStageId AND ts.IsDeleted = 0
        WHERE g.GateDefinitionId = @Gate AND g.IsDeleted = 0;

        IF @GateName IS NULL
            THROW 50054, N'usp_OpenGate: gate definition not found.', 1;

        -- Freeze slot definitions + eligible members (BS §7.2). Shape:
        --   [{ slotIndex, roleLabel, displayLabel, eligibleMembers: [{ userId, displayName }] }]
        DECLARE @Frozen NVARCHAR(MAX) = ISNULL((
            SELECT
                s.SlotIndex AS slotIndex,
                s.RoleLabel AS roleLabel,
                s.RoleLabel AS displayLabel,
                JSON_QUERY(ISNULL((
                    SELECT u.UserId AS userId, u.DisplayName AS displayName
                    FROM dbo.ApproverTeamMembership AS atm
                    INNER JOIN dbo.Users AS u ON u.UserId = atm.UserId AND u.IsDeleted = 0
                    WHERE atm.WorkspaceId = @Ws AND atm.RoleLabel = s.RoleLabel AND atm.IsDeleted = 0
                    ORDER BY u.DisplayName
                    FOR JSON PATH
                ), N'[]')) AS eligibleMembers
            FROM dbo.GateApproverSlot AS s
            WHERE s.GateDefinitionId = @Gate AND s.IsDeleted = 0
            ORDER BY s.SlotIndex
            FOR JSON PATH
        ), N'[]');

        INSERT INTO dbo.ApprovalRequests
            (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId, GateName,
             FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State,
             OpenedByUserId, OpenedAt, RespondByDate, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
        VALUES
            (@NewId, @Record, @Ws, @Gate, @GateName,
             @FromKey, @ToKey, @FromLabel, @ToLabel, N'Pending',
             @By, @OpenedAt, @RespondBy, @Frozen, 0, @ByText, @ByText);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        v.ApprovalRequestId, v.RequestRecordId, v.WorkspaceId, v.GateDefinitionId, v.GateName,
        v.FromStageKey, v.ToStageKey, v.FromStageLabel, v.ToStageLabel, v.State,
        v.OpenedAt, v.ResolvedAt, v.RespondByDate, v.FrozenApproverSet, v.DecisionsJson
    FROM dbo.vw_ApprovalRequestDetail AS v
    WHERE v.ApprovalRequestId = @NewId;
END;
GO
