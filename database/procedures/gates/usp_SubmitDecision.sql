-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals; Slice 26 — hold guard)
-- Create Date: 2026-07-04
-- Last update: 2026-07-17 (Slice 26 — hold guard: parent record's StatusHold blocks any decision)
-- Description: Records an Approve/Reject decision on one frozen slot (BS §7.2 / §7.3). The signer
--              (@DecidedByUserId — the name the acting member picked) must be in the slot's frozen
--              eligible set AND currently a member of the slot's team, UNLESS @IsProxy = 1 (an
--              admin recording an off-platform sign-off, which bypasses the live-eligibility gate).
--              A rejection requires a comment. The new decision supersedes the slot's prior live
--              decision (append-only history — a superseded rejection stays visible). When every
--              frozen slot has a live Approved decision the gate Resolves and the record advances to
--              the gate's target stage (mirrors usp_SetRequestStage — the AND-join is satisfied); a
--              live rejection moves the gate to ChangesRequested.
--
--              THROW numbers → API mappings: 50055 already-resolved (409); 50056 unknown slot (400);
--              50057 not-eligible (400); 50053 rejection-requires-comment (400); 50058 bad decision
--              (400). Access-gated on the caller's membership: no row → empty result set (→ 403).
--              Returns the updated gate via vw_ApprovalRequestDetail.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SubmitDecision
    @ApprovalRequestId UNIQUEIDENTIFIER,
    @UserId            UNIQUEIDENTIFIER,
    @SlotIndex         INT,
    @DecidedByUserId   UNIQUEIDENTIFIER,
    @Decision          NVARCHAR(16),
    @Comment           NVARCHAR(MAX),
    @IsProxy           BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ar     UNIQUEIDENTIFIER = @ApprovalRequestId;
    DECLARE @By     UNIQUEIDENTIFIER = @UserId;
    DECLARE @ByText NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(256));
    DECLARE @Slot   INT              = @SlotIndex;
    DECLARE @Signer UNIQUEIDENTIFIER = @DecidedByUserId;
    DECLARE @Dec    NVARCHAR(16)     = @Decision;
    DECLARE @Cmt    NVARCHAR(MAX)    = @Comment;
    DECLARE @Proxy  BIT              = @IsProxy;

    DECLARE @WsId UNIQUEIDENTIFIER, @Record NVARCHAR(20), @State NVARCHAR(24),
            @Frozen NVARCHAR(MAX), @ToKey NVARCHAR(64), @RoleLabel NVARCHAR(120), @SlotCount INT;

    -- Access gate: a normal decision needs Member+ on the gate's workspace; an admin proxy needs
    -- WorkspaceAdmin (BS §7.3). No qualifying row → nothing (→ 403).
    SELECT @WsId = ar.WorkspaceId, @Record = ar.RequestRecordId, @State = ar.State,
           @Frozen = ar.FrozenApproverSet, @ToKey = ar.ToStageKey
    FROM dbo.ApprovalRequests AS ar
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = ar.WorkspaceId AND m.UserId = @By AND m.IsDeleted = 0
       AND ((@Proxy = 0 AND m.Level IN (N'Member', N'WorkspaceAdmin'))
            OR (@Proxy = 1 AND m.Level = N'WorkspaceAdmin'))
    WHERE ar.ApprovalRequestId = @Ar AND ar.IsDeleted = 0;

    IF @WsId IS NULL
        RETURN;

    -- Slice 26 hold guard: any decision (Approve or Reject) on a held record is blocked.
    -- The addendum's "On hold pauses gate approvals" wording covers both directions; the guard
    -- fires before the state / eligibility checks so the caller sees the hold immediately.
    IF EXISTS (
        SELECT 1 FROM dbo.Requests
        WHERE RecordId = @Record AND WorkspaceId = @WsId AND IsDeleted = 0
          AND StatusHold = N'OnHold')
        THROW 51201, N'usp_SubmitDecision: this record is on hold. Reactivate it before deciding.', 1;

    IF @State = N'Resolved'
        THROW 50055, N'usp_SubmitDecision: this gate is already resolved.', 1;

    IF @Dec NOT IN (N'Approved', N'Rejected')
        THROW 50058, N'usp_SubmitDecision: decision must be Approved or Rejected.', 1;

    -- The slot must exist in the frozen set; capture its role label + total slot count.
    SELECT @RoleLabel = slot.roleLabel
    FROM OPENJSON(@Frozen)
        WITH (slotIndex INT '$.slotIndex', roleLabel NVARCHAR(120) '$.roleLabel') AS slot
    WHERE slot.slotIndex = @Slot;

    IF @RoleLabel IS NULL
        THROW 50056, N'usp_SubmitDecision: slot index is not part of this gate.', 1;

    SET @SlotCount = (SELECT COUNT(*) FROM OPENJSON(@Frozen));

    -- Eligibility (skipped for admin proxy — off-platform sign-off, BS §7.3): the signer must be in
    -- the frozen eligible set for THIS slot AND currently a member of the slot's team.
    IF @Proxy = 0
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM OPENJSON(@Frozen)
                WITH (slotIndex INT '$.slotIndex', eligibleMembers NVARCHAR(MAX) '$.eligibleMembers' AS JSON) AS slot
            CROSS APPLY OPENJSON(slot.eligibleMembers)
                WITH (userId UNIQUEIDENTIFIER '$.userId') AS mem
            WHERE slot.slotIndex = @Slot AND mem.userId = @Signer)
            THROW 50057, N'usp_SubmitDecision: the selected name is not eligible for this slot.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.ApproverTeamMembership
            WHERE WorkspaceId = @WsId AND RoleLabel = @RoleLabel AND UserId = @Signer AND IsDeleted = 0)
            THROW 50057, N'usp_SubmitDecision: the selected name is no longer a member of this team.', 1;
    END;

    -- Rejection requires a comment (blueprint rule). API returns 400 first; this is the backstop.
    IF @Dec = N'Rejected' AND (@Cmt IS NULL OR LEN(LTRIM(RTRIM(@Cmt))) = 0)
        THROW 50053, N'usp_SubmitDecision: a rejection requires a comment.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Supersede the slot's current live decision (at most one) — the new decision replaces it.
        UPDATE dbo.ApprovalDecisions
        SET SupersededAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @ByText
        WHERE ApprovalRequestId = @Ar AND SlotIndex = @Slot AND SupersededAt IS NULL AND IsDeleted = 0;

        INSERT INTO dbo.ApprovalDecisions
            (DecisionId, ApprovalRequestId, SlotIndex, Decision, DecidedByUserId, Comment, IsProxy,
             IsDeleted, CreatedBy, UpdatedBy)
        VALUES
            (NEWID(), @Ar, @Slot, @Dec, @Signer, @Cmt, @Proxy, 0, @ByText, @ByText);

        -- Recompute gate state from the live (non-superseded) decisions.
        DECLARE @LiveApproved INT = (
            SELECT COUNT(*) FROM dbo.ApprovalDecisions
            WHERE ApprovalRequestId = @Ar AND SupersededAt IS NULL AND IsDeleted = 0 AND Decision = N'Approved');
        DECLARE @LiveRejected INT = (
            SELECT COUNT(*) FROM dbo.ApprovalDecisions
            WHERE ApprovalRequestId = @Ar AND SupersededAt IS NULL AND IsDeleted = 0 AND Decision = N'Rejected');

        DECLARE @NewState NVARCHAR(24) =
            CASE
                WHEN @LiveRejected > 0            THEN N'ChangesRequested'
                WHEN @LiveApproved >= @SlotCount  THEN N'Resolved'
                ELSE N'Pending'
            END;

        UPDATE dbo.ApprovalRequests
        SET State      = @NewState,
            ResolvedAt = CASE WHEN @NewState = N'Resolved' THEN SYSUTCDATETIME() ELSE NULL END,
            UpdatedAt  = SYSUTCDATETIME(),
            UpdatedBy  = @ByText
        WHERE ApprovalRequestId = @Ar;

        -- On resolution the AND-join is satisfied (every slot approved) → advance the record to the
        -- gate's target stage. Mirrors usp_SetRequestStage's Stage + FieldValues mirror update.
        IF @NewState = N'Resolved'
        BEGIN
            UPDATE dbo.Requests
            SET Stage       = @ToKey,
                FieldValues = JSON_MODIFY(FieldValues, N'$.stage', @ToKey),
                UpdatedBy   = @ByText,
                UpdatedAt   = SYSUTCDATETIME()
            WHERE RecordId = @Record AND WorkspaceId = @WsId AND IsDeleted = 0;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        v.ApprovalRequestId, v.RequestRecordId, v.WorkspaceId, v.GateDefinitionId, v.GateName,
        v.FromStageKey, v.ToStageKey, v.FromStageLabel, v.ToStageLabel, v.State,
        v.OpenedAt, v.ResolvedAt, v.FrozenApproverSet, v.DecisionsJson
    FROM dbo.vw_ApprovalRequestDetail AS v
    WHERE v.ApprovalRequestId = @Ar;
END;
GO
