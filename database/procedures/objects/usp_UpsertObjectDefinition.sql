-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Creates or updates one CUSTOM object definition (S30 Objects tab).
--              @ObjectDefinitionId = NULL → create; non-null → patch existing. WorkspaceAdmin
--              is enforced at the controller. Built-in objects are constants and are never
--              written here.
--
--              On CREATE the proc generates an immutable ObjectKey slug from @Name (lowercase,
--              separators → '-', collapsed, trimmed) and disambiguates with a numeric suffix so
--              it is unique per workspace. The slug is copied into FieldDefinition.ObjectType for
--              the object's fields. A rename (UPDATE) changes Name/PluralLabel but NEVER the slug.
--
--              Error contract:
--                50080 → object definition not found (update path).
--                50081 → an active object with the same name already exists in the workspace.
--
--              Updated 2026-07-26 (SP3b Slice 1) — @WorkspaceId may be NULL to create/patch a
--              Global custom object (Location='Global'). Name-uniqueness, slug disambiguation, and
--              the update-path existence check all operate on "the same namespace as the row being
--              written": the calling workspace when @WorkspaceId is supplied, or the Global
--              namespace (all rows with Location='Global') when @WorkspaceId is NULL. Workspace
--              create/patch is unaffected — it always passes a real @WorkspaceId.
--
--              Updated 2026-07-27 (restrict-global-object-authoring) — the @Ws IS NULL ("platform
--              caller") branch is now gated on ownership (WorkspaceId IS NULL), not the Location
--              label alone. A workspace-owned row that is mislabelled Location='Global' (the
--              defect this fix closes) must never match a platform (@Ws IS NULL) write. For a real
--              workspace caller (@Ws NOT NULL) this is behavior-preserving — the first arm is
--              always false and the predicate reduces to WorkspaceId = @Ws.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertObjectDefinition
    @ObjectDefinitionId    UNIQUEIDENTIFIER = NULL,   -- NULL → create; non-null → patch existing
    @WorkspaceId           UNIQUEIDENTIFIER,
    @Name                  NVARCHAR(120),
    @PluralLabel           NVARCHAR(120)   = NULL,
    @Location              NVARCHAR(20),
    @Description           NVARCHAR(500)   = NULL,
    @ShowInSidebar         BIT             = 0,
    @SidebarCategory       NVARCHAR(80)    = NULL,
    @ActorUserId           NVARCHAR(256),
    @NewObjectDefinitionId UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Parameter-sniffing mitigation (locals).
    DECLARE @Id        UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Ws        UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Nm        NVARCHAR(120)    = @Name;
    DECLARE @Plural    NVARCHAR(120)    = @PluralLabel;
    DECLARE @Loc       NVARCHAR(20)     = @Location;
    DECLARE @Desc      NVARCHAR(500)    = @Description;
    DECLARE @ShowNav   BIT              = ISNULL(@ShowInSidebar, 0);
    DECLARE @Category  NVARCHAR(80)     = @SidebarCategory;
    DECLARE @Actor     NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now       DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Name uniqueness (active rows), excluding the row being patched. Scoped to the calling
        -- workspace, or to the Global namespace when @Ws IS NULL.
        IF EXISTS (
            SELECT 1 FROM dbo.ObjectDefinition
            WHERE ((@Ws IS NULL AND WorkspaceId IS NULL AND Location = N'Global') OR WorkspaceId = @Ws)
              AND Name = @Nm AND IsDeleted = 0
              AND (@Id IS NULL OR ObjectDefinitionId <> @Id))
            THROW 50081, 'An object with this name already exists in this workspace.', 1;

        IF @Id IS NULL
        BEGIN
            -- CREATE path.
            SET @Id = NEWID();

            -- Build the base slug from @Name: lowercase, whitespace/common separators → '-',
            -- three collapse passes (matches migration 077's backfill transform), then trim the
            -- leading/trailing hyphens and cap the length so a disambiguator can be appended.
            DECLARE @BaseSlug NVARCHAR(64) =
                REPLACE(REPLACE(REPLACE(
                REPLACE(REPLACE(REPLACE(
                REPLACE(REPLACE(REPLACE(REPLACE(
                    LOWER(LTRIM(RTRIM(@Nm)))
                    , N' ',      N'-')
                    , NCHAR(9),  N'-')
                    , NCHAR(10), N'-')
                    , NCHAR(13), N'-')
                    , N'_',      N'-')
                    , N'/',      N'-')
                    , N'&',      N'-')
                    , N'--',     N'-')
                    , N'--',     N'-')
                    , N'--',     N'-');

            WHILE LEFT(@BaseSlug, 1) = N'-'
                SET @BaseSlug = STUFF(@BaseSlug, 1, 1, N'');
            WHILE @BaseSlug <> N'' AND RIGHT(@BaseSlug, 1) = N'-'
                SET @BaseSlug = LEFT(@BaseSlug, LEN(@BaseSlug) - 1);
            IF @BaseSlug = N'' SET @BaseSlug = N'object';
            SET @BaseSlug = LEFT(@BaseSlug, 55);

            -- Disambiguate to a value unique among the workspace's active objects.
            DECLARE @Slug   NVARCHAR(64) = @BaseSlug;
            DECLARE @Suffix INT          = 1;
            WHILE EXISTS (
                SELECT 1 FROM dbo.ObjectDefinition
                WHERE ((@Ws IS NULL AND WorkspaceId IS NULL AND Location = N'Global') OR WorkspaceId = @Ws)
                  AND ObjectKey = @Slug AND IsDeleted = 0)
            BEGIN
                SET @Suffix += 1;
                SET @Slug = @BaseSlug + N'-' + CAST(@Suffix AS NVARCHAR(8));
            END;

            INSERT INTO dbo.ObjectDefinition
                (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel, Location, Description,
                 ShowInSidebar, SidebarCategory,
                 CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
            VALUES
                (@Id, @Ws, @Slug, @Nm, @Plural, @Loc, @Desc,
                 @ShowNav, @Category,
                 @Now, @Now, @Actor, @Actor);
        END
        ELSE
        BEGIN
            -- UPDATE path. ObjectKey is immutable — a rename never repoints field rows/records.
            IF NOT EXISTS (
                SELECT 1 FROM dbo.ObjectDefinition
                WHERE ObjectDefinitionId = @Id
                  AND ((@Ws IS NULL AND WorkspaceId IS NULL AND Location = N'Global') OR WorkspaceId = @Ws) AND IsDeleted = 0)
                THROW 50080, 'Object definition not found.', 1;

            UPDATE dbo.ObjectDefinition
               SET Name            = @Nm,
                   PluralLabel     = @Plural,
                   Location        = @Loc,
                   Description     = @Desc,
                   ShowInSidebar   = @ShowNav,
                   SidebarCategory = @Category,
                   UpdatedBy       = @Actor,
                   UpdatedAt       = @Now
             WHERE ObjectDefinitionId = @Id
               AND ((@Ws IS NULL AND WorkspaceId IS NULL AND Location = N'Global') OR WorkspaceId = @Ws);
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SET @NewObjectDefinitionId = @Id;
END;
GO
