-- =============================================
-- Author:      /dev-build-application (Slice 26 — Record Status/hold model)
-- Create Date: 2026-07-17
-- Description: Sets a Request's tri-state Status/hold (v2-reconciliation.md §Model deltas 3):
--                'InProgress' | 'OnHold' | 'Abandoned'
--              Supersedes usp_SetRequestHold (which took a binary @Held / @Reason pair and
--              wrote only into FieldValues JSON). Both column state AND JSON mirror are
--              updated so:
--                (1) the new StatusHold column is source of truth for reads and guards
--                    (usp_PatchTask, usp_SubmitDecision, usp_SetRequestStage read it);
--                (2) the JSON keys `$.holdBlocked` / `$.holdReason` stay consistent for the
--                    condition engine's Display/Mirror Status derivation (BS §3.4) — same
--                    mirror-on-write pattern usp_SetRequestStage uses for `$.stage`.
--
--              Mirror rules:
--                - StatusHold='OnHold'     → $.holdBlocked='true',  $.holdReason=@Note
--                - StatusHold='Abandoned'  → $.holdBlocked='true',  $.holdReason=@Note
--                                            (Display Status derivation treats Abandoned as
--                                            a held state — the pill copy differs, the
--                                            block semantics are the same.)
--                - StatusHold='InProgress' → $.holdBlocked='false', $.holdReason=NULL
--
--              Note is optional (NULL) — the UI validates that a non-InProgress transition
--              carries a note; this proc does not force one. Access-gated API-side before
--              this runs. THROW 50043 if the record is not found. No result set — caller
--              re-reads.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertRequestStatusHold
    @RecordId     NVARCHAR(20),
    @WorkspaceId  UNIQUEIDENTIFIER,
    @StatusHold   NVARCHAR(20),
    @Note         NVARCHAR(500) = NULL,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Status        NVARCHAR(20)     = @StatusHold;
    DECLARE @NoteLocal     NVARCHAR(500)    = @Note;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;

    -- Local scalars for the JSON mirror. Mirror carries 'true' when non-Active; the Display /
    -- Mirror Status derivation reads `$.holdBlocked` and does not distinguish OnHold from
    -- Abandoned (the pill copy differs — the block semantics are the same).
    DECLARE @JsonHeldText  NVARCHAR(5)      = CASE WHEN @Status = N'InProgress' THEN N'false' ELSE N'true' END;
    DECLARE @JsonReason    NVARCHAR(500)    = CASE WHEN @Status = N'InProgress' THEN NULL ELSE @NoteLocal END;

    IF @Status NOT IN (N'InProgress', N'OnHold', N'Abandoned')
        THROW 50060, N'usp_UpsertRequestStatusHold: statusHold must be InProgress, OnHold, or Abandoned.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Requests WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0)
        THROW 50043, N'usp_UpsertRequestStatusHold: request not found.', 1;

    UPDATE dbo.Requests
    SET StatusHold     = @Status,
        StatusHoldNote = CASE WHEN @Status = N'InProgress' THEN NULL ELSE @NoteLocal END,
        FieldValues    = JSON_MODIFY(
                             JSON_MODIFY(FieldValues, N'$.holdReason', @JsonReason),
                             N'$.holdBlocked', CAST(@JsonHeldText AS NVARCHAR(5))),
        UpdatedBy      = @Actor,
        UpdatedAt      = SYSUTCDATETIME()
    WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;
END;
GO
