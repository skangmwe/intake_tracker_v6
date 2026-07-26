-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Soft-deletes one CUSTOM object definition (S30 Objects tab → editor Delete).
--              WorkspaceAdmin is enforced at the controller. Built-in objects are constants
--              and cannot be deleted. Idempotent from the caller's view: a missing/already-
--              deleted row throws 50080 so the controller returns 404.
--
--              Error contract:
--                50080 → object definition not found (or already deleted).
--
--              Updated 2026-07-26 (SP3b Slice 1) — a platform delete of a Global object passes
--              @WorkspaceId = NULL; the existence check and the update accept a Global row
--              (Location='Global') in that case, alongside the normal own-workspace match.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteObjectDefinition
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ActorUserId        NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.ObjectDefinition
            WHERE ObjectDefinitionId = @Id
              AND ((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws) AND IsDeleted = 0)
            THROW 50080, 'Object definition not found.', 1;

        UPDATE dbo.ObjectDefinition
           SET IsDeleted = 1,
               DeletedAt = @Now,
               UpdatedBy = @Actor,
               UpdatedAt = @Now
         WHERE ObjectDefinitionId = @Id
           AND ((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
