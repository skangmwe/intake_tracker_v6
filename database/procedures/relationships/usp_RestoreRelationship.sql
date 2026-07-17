-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships)
-- Create Date: 2026-07-16
-- Description: Restores a soft-retired Relationship (v2-reconciliation.md §API deltas
--              Relationships POST /relationships/{id}/restore). Re-hydrates the paired
--              auto-provisioned FieldDefinition rows (clears IsRetired). System rows
--              are never retired in the first place; blocked with 50062.
--
--              Error contract:
--                50060 → relationship not found.
--                50062 → cannot restore a system relationship (never retired).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RestoreRelationship
    @RelationshipId UNIQUEIDENTIFIER,
    @WorkspaceId    UNIQUEIDENTIFIER,
    @ActorUserId    NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id     UNIQUEIDENTIFIER = @RelationshipId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Actor  NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsSystem BIT;
        SELECT @IsSystem = IsSystem
        FROM   dbo.Relationships
        WHERE  RelationshipId = @Id AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @IsSystem IS NULL
            THROW 50060, 'Relationship not found.', 1;

        IF @IsSystem = 1
            THROW 50062, 'System relationships are never retired.', 1;

        UPDATE dbo.Relationships
           SET IsRetired = 0,
               RetiredAt = NULL,
               UpdatedBy = @Actor,
               UpdatedAt = @Now
         WHERE RelationshipId = @Id AND IsRetired = 1;

        UPDATE dbo.FieldDefinition
           SET IsRetired = 0,
               RetiredAt = NULL,
               UpdatedBy = @Actor,
               UpdatedAt = @Now
         WHERE RelationshipId = @Id AND IsRetired = 1 AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
