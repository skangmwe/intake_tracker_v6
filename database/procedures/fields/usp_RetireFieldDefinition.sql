-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Retires a workspace field (sets IsRetired = 1 with RetiredAt) — configuration
--              retirement with history preserved (BS §4.3), never a hard delete. Guards
--              (BS §6.2, §7.1 retirement guard):
--                - A platform-defined field cannot be retired here (governed in S34) → THROW.
--                - A field another live field still DEPENDS ON (a rule/derivation source)
--                  cannot be retired until that reference is removed → THROW.
--                - A field referenced by a live (non-deleted) CrossingMap mapping — proposed or
--                  confirmed — on either side cannot be retired until that mapping is removed → THROW
--                  50014 (BS §6.2 crossing-map retirement guard; the CrossingMap table lands in slice 24).
--              Idempotent — re-retiring an already-retired field is a no-op.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireFieldDefinition
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16),
    @FieldKey    NVARCHAR(64),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;
    DECLARE @FieldKeyLocal     NVARCHAR(64)    = @FieldKey;
    DECLARE @Actor             NVARCHAR(256)   = @ActorUserId;
    DECLARE @Now               DATETIME2       = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsPlatformDefined BIT, @IsRetired BIT;
        SELECT @IsPlatformDefined = IsPlatformDefined, @IsRetired = IsRetired
        FROM dbo.FieldDefinition
        WHERE WorkspaceId = @WorkspaceIdLocal AND ObjectType = @ObjectTypeLocal
          AND FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        IF @IsPlatformDefined IS NULL
            THROW 50011, 'Field not found.', 1;

        IF @IsPlatformDefined = 1
            THROW 50012, 'This field is platform-defined and cannot be retired here (S34).', 1;

        -- Dependency guard: another live, non-retired field still references this one.
        IF EXISTS (
            SELECT 1
            FROM dbo.FieldRuleDependency dep
            INNER JOIN dbo.FieldDefinition src
                ON src.WorkspaceId = dep.WorkspaceId AND src.ObjectType = dep.ObjectType
               AND src.FieldKey = dep.FromFieldKey AND src.IsDeleted = 0 AND src.IsRetired = 0
            WHERE dep.WorkspaceId = @WorkspaceIdLocal AND dep.ObjectType = @ObjectTypeLocal
              AND dep.ToFieldKey = @FieldKeyLocal AND dep.IsDeleted = 0)
            THROW 50013, 'This field is referenced by another field''s rule or derivation and cannot be retired until that reference is removed.', 1;

        -- Crossing-map guard (slice 24): a live PG<->AI mapping (proposed or confirmed) on either side
        -- keeps this field mappable — retiring it would strand the mapping. Resolve this field's id and
        -- check the CrossingMap table.
        IF EXISTS (
            SELECT 1
            FROM dbo.CrossingMap cm
            INNER JOIN dbo.FieldDefinition fd
                ON fd.FieldDefinitionId IN (cm.PgFieldDefinitionId, cm.AiFieldDefinitionId)
            WHERE cm.IsDeleted = 0
              AND fd.WorkspaceId = @WorkspaceIdLocal
              AND fd.ObjectType = @ObjectTypeLocal
              AND fd.FieldKey = @FieldKeyLocal
              AND fd.IsDeleted = 0)
            THROW 50014, 'This field is used by a live crossing-map mapping and cannot be retired until that mapping is removed.', 1;

        IF @IsRetired = 0
            UPDATE dbo.FieldDefinition
            SET IsRetired = 1, RetiredAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
            WHERE WorkspaceId = @WorkspaceIdLocal AND ObjectType = @ObjectTypeLocal
              AND FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
