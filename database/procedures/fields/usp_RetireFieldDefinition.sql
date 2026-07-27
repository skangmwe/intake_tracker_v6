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
--
--              Updated 2026-07-26 (SP3b Slice 2a) — @WorkspaceId may be NULL to retire a Global
--              (platform-owned) field. The row-lookup, the crossing-map guard's field-identity
--              join, and the retiring UPDATE all resolve "this field" via "the calling
--              workspace when @WorkspaceId is supplied, or ONLY a truly platform-owned row
--              (WorkspaceId IS NULL AND Location='Global') when @WorkspaceId is NULL" — mirrors
--              usp_UpsertFieldDefinition. Every Global-arm predicate requires WorkspaceId IS
--              NULL, not Location alone, so a platform retire (@WorkspaceId=NULL) can never
--              match or modify a tenant's mislabelled row (WorkspaceId=<real ws>,
--              Location='Global') — Location is caller-supplied and unvalidated against
--              WorkspaceId. Workspace retire is unaffected — it always passes a real
--              @WorkspaceId and still matches only its own WorkspaceId.
--
--              Updated 2026-07-26 (SP3b Slice 2a, Task 2 fix pass) — dbo.FieldRuleDependency.WorkspaceId
--              is now nullable (migration 102), so a Global field CAN have live dependency rows
--              (WorkspaceId=NULL). The dependency guard's join (src.WorkspaceId = dep.WorkspaceId)
--              and its own WHERE (dep.WorkspaceId = @WorkspaceIdLocal) are both relaxed to also
--              match on "both sides NULL" — otherwise NULL = NULL evaluates UNKNOWN and the guard
--              would silently never fire for a Global field, letting it be retired out from under
--              a live rule/derivation that still depends on it. No Location column exists on
--              FieldRuleDependency, so this is not an ownership-leak concern like the
--              FieldDefinition-row predicates above — WorkspaceId is the sole source of truth for
--              whose edges these are.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireFieldDefinition
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64),
    @FieldKey    NVARCHAR(64),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(64)     = @ObjectType;
    DECLARE @FieldKeyLocal     NVARCHAR(64)    = @FieldKey;
    DECLARE @Actor             NVARCHAR(256)   = @ActorUserId;
    DECLARE @Now               DATETIME2       = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsPlatformDefined BIT, @IsRetired BIT;
        SELECT @IsPlatformDefined = IsPlatformDefined, @IsRetired = IsRetired
        FROM dbo.FieldDefinition
        WHERE (WorkspaceId = @WorkspaceIdLocal OR (@WorkspaceIdLocal IS NULL AND WorkspaceId IS NULL AND Location = N'Global'))
          AND ObjectType = @ObjectTypeLocal
          AND FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        IF @IsPlatformDefined IS NULL
            THROW 50011, 'Field not found.', 1;

        IF @IsPlatformDefined = 1
            THROW 50012, 'This field is platform-defined and cannot be retired here (S34).', 1;

        -- Dependency guard: another live, non-retired field still references this one. The join and
        -- the WHERE both accept "both sides NULL" (a Global-to-Global dependency edge) alongside
        -- ordinary equality — see header comment.
        IF EXISTS (
            SELECT 1
            FROM dbo.FieldRuleDependency dep
            INNER JOIN dbo.FieldDefinition src
                ON (src.WorkspaceId = dep.WorkspaceId OR (src.WorkspaceId IS NULL AND dep.WorkspaceId IS NULL))
               AND src.ObjectType = dep.ObjectType
               AND src.FieldKey = dep.FromFieldKey AND src.IsDeleted = 0 AND src.IsRetired = 0
            WHERE (dep.WorkspaceId = @WorkspaceIdLocal OR (@WorkspaceIdLocal IS NULL AND dep.WorkspaceId IS NULL))
              AND dep.ObjectType = @ObjectTypeLocal
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
              AND (fd.WorkspaceId = @WorkspaceIdLocal OR (@WorkspaceIdLocal IS NULL AND fd.WorkspaceId IS NULL AND fd.Location = N'Global'))
              AND fd.ObjectType = @ObjectTypeLocal
              AND fd.FieldKey = @FieldKeyLocal
              AND fd.IsDeleted = 0)
            THROW 50014, 'This field is used by a live crossing-map mapping and cannot be retired until that mapping is removed.', 1;

        IF @IsRetired = 0
            UPDATE dbo.FieldDefinition
            SET IsRetired = 1, RetiredAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
            WHERE (WorkspaceId = @WorkspaceIdLocal OR (@WorkspaceIdLocal IS NULL AND WorkspaceId IS NULL AND Location = N'Global'))
              AND ObjectType = @ObjectTypeLocal
              AND FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
