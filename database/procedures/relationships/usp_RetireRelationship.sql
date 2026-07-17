-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships)
-- Create Date: 2026-07-16
-- Description: Soft-retires a Relationship (v2-reconciliation.md §API deltas
--              Relationships POST /relationships/{id}/retire). Retirement hides the
--              Relationship + its auto-provisioned FieldDefinition rows from the S30
--              editor but preserves historical RecordLinks rows for audit.
--
--              Retire-with-existing-links behavior: counts live RecordLinks rows for
--              this Relationship and:
--                @Force = 0 AND @LinkCount > 0  → returns @LinkCount OUTPUT, does NOT
--                                                  set IsRetired; caller (API service)
--                                                  translates to 409 with a "retire will
--                                                  hide N live links" ProblemDetails,
--                                                  the S30 UI then confirms and re-calls
--                                                  with @Force = 1.
--                @Force = 1 OR @LinkCount = 0   → sets IsRetired = 1 + RetiredAt = now,
--                                                  soft-retires the auto-provisioned
--                                                  FieldDefinitions.
--
--              System rows (IsSystem = 1) cannot be retired — the config-driven tab bar
--              depends on them. Blocked with 50062.
--
--              Error contract:
--                50060 → relationship not found.
--                50062 → cannot retire a system relationship.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireRelationship
    @RelationshipId UNIQUEIDENTIFIER,
    @WorkspaceId    UNIQUEIDENTIFIER,
    @Force          BIT              = 0,
    @ActorUserId    NVARCHAR(256),
    @LinkCount      INT              OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id     UNIQUEIDENTIFIER = @RelationshipId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @F      BIT              = ISNULL(@Force, 0);
    DECLARE @Actor  NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();
    DECLARE @Count  INT              = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsSystem BIT, @IsRetired BIT;
        SELECT @IsSystem  = IsSystem,
               @IsRetired = IsRetired
        FROM   dbo.Relationships
        WHERE  RelationshipId = @Id AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @IsSystem IS NULL
            THROW 50060, 'Relationship not found.', 1;

        IF @IsSystem = 1
            THROW 50062, 'System relationships cannot be retired.', 1;

        -- Count live links for this relationship (across all records — the count
        -- surfaces in the caller's 409 message).
        SELECT @Count = COUNT(1)
        FROM   dbo.RecordLinks
        WHERE  RelationshipId = @Id AND IsDeleted = 0;

        IF @Count > 0 AND @F = 0
        BEGIN
            -- Caller (API) sees LinkCount > 0 and Retired flag unchanged → returns 409.
            SET @LinkCount = @Count;
            COMMIT TRANSACTION;
            RETURN;
        END

        -- Retire the Relationship + soft-retire its auto-provisioned fields.
        IF @IsRetired = 0
            UPDATE dbo.Relationships
               SET IsRetired = 1,
                   RetiredAt = @Now,
                   UpdatedBy = @Actor,
                   UpdatedAt = @Now
             WHERE RelationshipId = @Id;

        UPDATE dbo.FieldDefinition
           SET IsRetired = 1,
               RetiredAt = @Now,
               UpdatedBy = @Actor,
               UpdatedAt = @Now
         WHERE RelationshipId = @Id AND IsDeleted = 0 AND IsRetired = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SET @LinkCount = @Count;
END;
GO
