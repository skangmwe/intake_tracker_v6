-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Upserts a personal Draft (data-model.md §Draft, BS §9.8). A NULL @DraftId mints a
--              new draft; a non-NULL one updates the caller's own draft (owner-scoped — the
--              @OwnerUserId predicate is the access boundary). Returns the draft id via OUTPUT.
--              Drafts are pre-audit; no event is emitted.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SaveDraft
    @DraftId     UNIQUEIDENTIFIER = NULL,
    @OwnerUserId UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16),
    @Title       NVARCHAR(400) = NULL,
    @Body        NVARCHAR(MAX),
    @ActorUserId NVARCHAR(256),
    @OutDraftId  UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @DraftIdLocal UNIQUEIDENTIFIER = @DraftId;
    DECLARE @Owner        UNIQUEIDENTIFIER = @OwnerUserId;
    DECLARE @Ws           UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjType      NVARCHAR(16)     = @ObjectType;
    DECLARE @TitleLocal   NVARCHAR(400)    = @Title;
    DECLARE @BodyLocal    NVARCHAR(MAX)    = ISNULL(@Body, N'{}');
    DECLARE @Actor        NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now          DATETIME2        = SYSUTCDATETIME();

    IF @DraftIdLocal IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.Drafts WHERE DraftId = @DraftIdLocal AND OwnerUserId = @Owner)
    BEGIN
        UPDATE dbo.Drafts
        SET Title = @TitleLocal, Body = @BodyLocal, LastEditedAt = @Now, UpdatedBy = @Actor
        WHERE DraftId = @DraftIdLocal AND OwnerUserId = @Owner;

        SET @OutDraftId = @DraftIdLocal;
    END
    ELSE
    BEGIN
        SET @OutDraftId = ISNULL(@DraftIdLocal, NEWID());

        INSERT INTO dbo.Drafts (DraftId, OwnerUserId, WorkspaceId, ObjectType, Title, Body,
                                LastEditedAt, CreatedBy, UpdatedBy)
        VALUES (@OutDraftId, @Owner, @Ws, @ObjType, @TitleLocal, @BodyLocal, @Now, @Actor, @Actor);
    END;
END;
GO
