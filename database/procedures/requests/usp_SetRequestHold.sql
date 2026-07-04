-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Sets or clears a Request's Hold flag. Hold lives in the field map
--              (holdBlocked / holdReason) because the condition engine derives Display/Mirror
--              Status from it (BS §3.4). Clearing hold nulls the reason. The HoldBlocked
--              computed column projects from the map for any hold-based filter. No result set —
--              the caller re-reads. Workspace level is checked API-side before this runs.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SetRequestHold
    @RecordId    NVARCHAR(20),
    @WorkspaceId UNIQUEIDENTIFIER,
    @Held        BIT,
    @Reason      NVARCHAR(400) = NULL,
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @HeldLocal     BIT              = @Held;
    DECLARE @ReasonLocal   NVARCHAR(400)    = CASE WHEN @Held = 1 THEN @Reason ELSE NULL END;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;
    DECLARE @HeldText      NVARCHAR(5)      = CASE WHEN @Held = 1 THEN N'true' ELSE N'false' END;

    IF NOT EXISTS (SELECT 1 FROM dbo.Requests WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0)
        THROW 50043, N'usp_SetRequestHold: request not found.', 1;

    UPDATE dbo.Requests
    SET FieldValues = JSON_MODIFY(
                          JSON_MODIFY(FieldValues, N'$.holdReason', @ReasonLocal),
                          N'$.holdBlocked', CAST(@HeldText AS NVARCHAR(5))),
        UpdatedBy   = @Actor,
        UpdatedAt   = SYSUTCDATETIME()
    WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;
END;
GO
