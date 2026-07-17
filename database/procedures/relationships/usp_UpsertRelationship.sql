-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships)
-- Create Date: 2026-07-16
-- Description: Creates or updates one Relationship row (v2-reconciliation.md
--              §API deltas Relationships POST /workspaces/{id}/relationships).
--              WorkspaceAdmin is enforced at the controller (AccessGuard); this proc
--              does the write and auto-provisions the paired Link-to-record
--              FieldDefinition rows in the same transaction (non-system rows only).
--
--              Cardinality and object-type triple (FromObjectType, ToObjectType,
--              Cardinality) are IMMUTABLE after create — the update path patches only
--              the mutable set (Name, side labels, tab config, sort order). Attempting
--              to change any immutable value THROWs 50061 (relationship-inconsistent-
--              cardinality). System rows (IsSystem = 1) are never created via this proc
--              (seeded by migration only) and cannot be updated here (blocked with 50062).
--
--              Auto-provisioning behaviour per Cardinality (non-system CREATE only):
--                OneToOne   → single RecordReference field on the From side.
--                OneToMany  → single RecordReference field on the To side pointing at From.
--                ManyToMany → RecordReference (allowMultiple=1) on BOTH sides.
--
--              Field keys are derived from the side labels (slugified). Field DisplayName
--              is the side label. Section defaults to 'Relationships'. IsSystemProvisioned
--              is left 0 on the auto-provisioned field — those are editable-in-value at
--              record level but the definition edit path is the Relationships editor
--              (RelationshipId FK marks them so the S30 Fields tab can show a lock).
--
--              Error contract:
--                50060 → relationship not found (update path).
--                50061 → relationship-inconsistent-cardinality (attempted immutable change).
--                50062 → cannot edit a system relationship.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertRelationship
    @RelationshipId   UNIQUEIDENTIFIER = NULL,   -- NULL → create; non-null → patch existing
    @WorkspaceId      UNIQUEIDENTIFIER,
    @Name             NVARCHAR(120),
    @FromObjectType   NVARCHAR(50),
    @ToObjectType     NVARCHAR(50),
    @Cardinality      NVARCHAR(20),
    @FromSideLabel    NVARCHAR(80),
    @ToSideLabel      NVARCHAR(80),
    @ShowOnFromAsTab  BIT              = 0,
    @TabLabel         NVARCHAR(80)     = NULL,
    @SortOrder        INT              = 0,
    @ActorUserId      NVARCHAR(256),
    @NewRelationshipId UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Parameter-sniffing mitigation (locals).
    DECLARE @Id       UNIQUEIDENTIFIER = @RelationshipId;
    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Nm       NVARCHAR(120)    = @Name;
    DECLARE @From     NVARCHAR(50)     = @FromObjectType;
    DECLARE @To       NVARCHAR(50)     = @ToObjectType;
    DECLARE @Card     NVARCHAR(20)     = @Cardinality;
    DECLARE @FromLbl  NVARCHAR(80)     = @FromSideLabel;
    DECLARE @ToLbl    NVARCHAR(80)     = @ToSideLabel;
    DECLARE @Tab      BIT              = ISNULL(@ShowOnFromAsTab, 0);
    DECLARE @TabLbl   NVARCHAR(80)     = @TabLabel;
    DECLARE @Order    INT              = ISNULL(@SortOrder, 0);
    DECLARE @Actor    NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now      DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @Id IS NULL
        BEGIN
            -- CREATE path.
            SET @Id = NEWID();

            INSERT INTO dbo.Relationships
                (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
                 FromSideLabel, ToSideLabel, ShowOnFromAsTab, TabLabel, SortOrder,
                 IsRetired, IsSystem,
                 CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
            VALUES
                (@Id, @Ws, @Nm, @From, @To, @Card,
                 @FromLbl, @ToLbl, @Tab, @TabLbl, @Order,
                 0, 0,
                 @Now, @Now, @Actor, @Actor);

            -- Auto-provision paired Link-to-record FieldDefinition rows.
            -- Field key: slugify side label (lowercase, non-alphanum → '-'). Kept short
            -- so unique-index UX_FieldDefinition_Workspace_Object_Key is unlikely to
            -- collide; on collision, upstream validation rejects the relationship name.

            DECLARE @FromFieldKey NVARCHAR(64) = LOWER(REPLACE(REPLACE(REPLACE(@ToLbl, N' ', N'-'), N'/', N'-'), N'.', N'-'));
            DECLARE @ToFieldKey   NVARCHAR(64) = LOWER(REPLACE(REPLACE(REPLACE(@FromLbl, N' ', N'-'), N'/', N'-'), N'.', N'-'));

            IF @Card = N'OneToOne'
            BEGIN
                -- Single RecordReference on the From side, pointing at To. allowMultiple = 0.
                INSERT INTO dbo.FieldDefinition
                    (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category,
                     Section, IsRequired, IsReadOnly, IsSystemProvisioned,
                     TargetObjectType, AllowMultiple, ReverseLinkLabel, RelationshipId,
                     SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
                SELECT @Ws, @From, @FromFieldKey, @ToLbl, N'RecordReference', N'WorkspaceLocal',
                       N'Relationships', 0, 0, 0,
                       @To, 0, @FromLbl, @Id,
                       999, @Actor, @Actor, @Now, @Now
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.FieldDefinition
                    WHERE WorkspaceId = @Ws AND ObjectType = @From AND FieldKey = @FromFieldKey AND IsDeleted = 0);
            END
            ELSE IF @Card = N'OneToMany'
            BEGIN
                -- Single RecordReference on the To side, pointing back at From. allowMultiple = 0
                -- (each child points at exactly one parent).
                INSERT INTO dbo.FieldDefinition
                    (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category,
                     Section, IsRequired, IsReadOnly, IsSystemProvisioned,
                     TargetObjectType, AllowMultiple, ReverseLinkLabel, RelationshipId,
                     SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
                SELECT @Ws, @To, @ToFieldKey, @FromLbl, N'RecordReference', N'WorkspaceLocal',
                       N'Relationships', 0, 0, 0,
                       @From, 0, @ToLbl, @Id,
                       999, @Actor, @Actor, @Now, @Now
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.FieldDefinition
                    WHERE WorkspaceId = @Ws AND ObjectType = @To AND FieldKey = @ToFieldKey AND IsDeleted = 0);
            END
            ELSE IF @Card = N'ManyToMany'
            BEGIN
                -- Two RecordReference fields (allowMultiple = 1) — one on each side.
                INSERT INTO dbo.FieldDefinition
                    (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category,
                     Section, IsRequired, IsReadOnly, IsSystemProvisioned,
                     TargetObjectType, AllowMultiple, ReverseLinkLabel, RelationshipId,
                     SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
                SELECT @Ws, @From, @FromFieldKey, @ToLbl, N'RecordReference', N'WorkspaceLocal',
                       N'Relationships', 0, 0, 0,
                       @To, 1, @FromLbl, @Id,
                       999, @Actor, @Actor, @Now, @Now
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.FieldDefinition
                    WHERE WorkspaceId = @Ws AND ObjectType = @From AND FieldKey = @FromFieldKey AND IsDeleted = 0);

                INSERT INTO dbo.FieldDefinition
                    (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category,
                     Section, IsRequired, IsReadOnly, IsSystemProvisioned,
                     TargetObjectType, AllowMultiple, ReverseLinkLabel, RelationshipId,
                     SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
                SELECT @Ws, @To, @ToFieldKey, @FromLbl, N'RecordReference', N'WorkspaceLocal',
                       N'Relationships', 0, 0, 0,
                       @From, 1, @ToLbl, @Id,
                       999, @Actor, @Actor, @Now, @Now
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.FieldDefinition
                    WHERE WorkspaceId = @Ws AND ObjectType = @To AND FieldKey = @ToFieldKey AND IsDeleted = 0);
            END
        END
        ELSE
        BEGIN
            -- UPDATE path.
            DECLARE @ExistingIsSystem BIT;
            DECLARE @ExistingFrom     NVARCHAR(50);
            DECLARE @ExistingTo       NVARCHAR(50);
            DECLARE @ExistingCard     NVARCHAR(20);

            SELECT @ExistingIsSystem = IsSystem,
                   @ExistingFrom     = FromObjectType,
                   @ExistingTo       = ToObjectType,
                   @ExistingCard     = Cardinality
            FROM   dbo.Relationships
            WHERE  RelationshipId = @Id AND WorkspaceId = @Ws AND IsDeleted = 0;

            IF @ExistingIsSystem IS NULL
                THROW 50060, 'Relationship not found.', 1;

            IF @ExistingIsSystem = 1
                THROW 50062, 'System relationships cannot be edited.', 1;

            IF @ExistingFrom <> @From OR @ExistingTo <> @To OR @ExistingCard <> @Card
                THROW 50061, 'Cardinality and object types are immutable after create.', 1;

            UPDATE dbo.Relationships
               SET Name            = @Nm,
                   FromSideLabel   = @FromLbl,
                   ToSideLabel     = @ToLbl,
                   ShowOnFromAsTab = @Tab,
                   TabLabel        = @TabLbl,
                   SortOrder       = @Order,
                   UpdatedBy       = @Actor,
                   UpdatedAt       = @Now
             WHERE RelationshipId  = @Id;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SET @NewRelationshipId = @Id;
END;
GO
