-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Creates or updates one CUSTOM object definition (S30 Objects tab).
--              @ObjectDefinitionId = NULL → create; non-null → patch existing. WorkspaceAdmin
--              is enforced at the controller. Built-in objects are constants and are never
--              written here.
--
--              Error contract:
--                50080 → object definition not found (update path).
--                50081 → an active object with the same name already exists in the workspace.
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

        -- Name uniqueness (active rows), excluding the row being patched.
        IF EXISTS (
            SELECT 1 FROM dbo.ObjectDefinition
            WHERE WorkspaceId = @Ws
              AND Name        = @Nm
              AND IsDeleted   = 0
              AND (@Id IS NULL OR ObjectDefinitionId <> @Id))
            THROW 50081, 'An object with this name already exists in this workspace.', 1;

        IF @Id IS NULL
        BEGIN
            -- CREATE path.
            SET @Id = NEWID();

            INSERT INTO dbo.ObjectDefinition
                (ObjectDefinitionId, WorkspaceId, Name, PluralLabel, Location, Description,
                 ShowInSidebar, SidebarCategory,
                 CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
            VALUES
                (@Id, @Ws, @Nm, @Plural, @Loc, @Desc,
                 @ShowNav, @Category,
                 @Now, @Now, @Actor, @Actor);
        END
        ELSE
        BEGIN
            -- UPDATE path.
            IF NOT EXISTS (
                SELECT 1 FROM dbo.ObjectDefinition
                WHERE ObjectDefinitionId = @Id AND WorkspaceId = @Ws AND IsDeleted = 0)
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
             WHERE ObjectDefinitionId = @Id AND WorkspaceId = @Ws;
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
