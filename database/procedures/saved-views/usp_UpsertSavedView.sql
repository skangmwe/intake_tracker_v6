-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Creates (NULL @SavedViewId) or updates an existing SavedView (BS §22.3-22.4). The
--              authorization decision (Member+ may create/edit a personal view they own; only a
--              WorkspaceAdmin may create/edit a shared view) is enforced API-side before this runs
--              — the proc writes what it is given. When @IsDefault = 1, the caller's prior default
--              on the SAME surface (OwnerUserId + WorkspaceId + ObjectType) is cleared so exactly
--              one default stands per user per list surface. Returns the id via OUTPUT.
--              Columns / Filters / Sort are opaque JSON validated by the table CHECK constraints.
--
--              Updated 2026-07-27 — @ObjectType widened NVARCHAR(16) -> NVARCHAR(64) to match the
--              SavedView.ObjectType column (widened by migration 086) so a per-object custom slug
--              longer than 16 chars is stored/matched without silent truncation.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertSavedView
    @SavedViewId   UNIQUEIDENTIFIER = NULL,
    @WorkspaceId   UNIQUEIDENTIFIER,
    @ObjectType    NVARCHAR(64),
    @Name          NVARCHAR(200),
    @Scope         NVARCHAR(16),
    @OwnerUserId   UNIQUEIDENTIFIER,
    @IsDefault     BIT,
    @ColumnsJson   NVARCHAR(MAX),
    @FiltersJson   NVARCHAR(MAX),
    @SortJson      NVARCHAR(MAX),
    @ActorUserId   NVARCHAR(256),
    @OutSavedViewId UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdLocal   UNIQUEIDENTIFIER = @SavedViewId;
    DECLARE @Ws        UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjType   NVARCHAR(64)     = @ObjectType;
    DECLARE @NameLocal NVARCHAR(200)    = @Name;
    DECLARE @ScopeLoc  NVARCHAR(16)     = @Scope;
    DECLARE @Owner     UNIQUEIDENTIFIER = @OwnerUserId;
    DECLARE @Default   BIT              = ISNULL(@IsDefault, 0);
    DECLARE @Columns   NVARCHAR(MAX)    = ISNULL(@ColumnsJson, N'[]');
    DECLARE @Filters   NVARCHAR(MAX)    = ISNULL(@FiltersJson, N'{}');
    DECLARE @Sort      NVARCHAR(MAX)    = ISNULL(@SortJson, N'[]');
    DECLARE @Actor     NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now       DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IdLocal IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.SavedView WHERE SavedViewId = @IdLocal AND IsDeleted = 0)
        BEGIN
            UPDATE dbo.SavedView
            SET Name        = @NameLocal,
                Scope       = @ScopeLoc,
                IsDefault   = @Default,
                ColumnsJson = @Columns,
                FiltersJson = @Filters,
                SortJson    = @Sort,
                UpdatedBy   = @Actor,
                UpdatedAt   = @Now
            WHERE SavedViewId = @IdLocal AND IsDeleted = 0;

            SET @OutSavedViewId = @IdLocal;
        END
        ELSE
        BEGIN
            SET @OutSavedViewId = ISNULL(@IdLocal, NEWID());

            INSERT INTO dbo.SavedView
                (SavedViewId, WorkspaceId, ObjectType, Name, Scope, OwnerUserId, IsDefault,
                 ColumnsJson, FiltersJson, SortJson, CreatedBy, UpdatedBy)
            VALUES
                (@OutSavedViewId, @Ws, @ObjType, @NameLocal, @ScopeLoc, @Owner, @Default,
                 @Columns, @Filters, @Sort, @Actor, @Actor);
        END;

        -- Exactly one default per user per surface: clear the owner's other defaults here.
        IF @Default = 1
        BEGIN
            UPDATE dbo.SavedView
            SET IsDefault = 0, UpdatedBy = @Actor, UpdatedAt = @Now
            WHERE OwnerUserId = @Owner
              AND WorkspaceId = @Ws
              AND ObjectType = @ObjType
              AND SavedViewId <> @OutSavedViewId
              AND IsDefault = 1
              AND IsDeleted = 0;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
