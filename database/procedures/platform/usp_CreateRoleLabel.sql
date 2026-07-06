-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Adds a gate role label to the platform-scope RoleLabelCatalog (S37 —
--              BS §4.3, §7.2). Labels feed S31's approver-slot / approver-team selectors.
--              Trims the label; rejects blank (THROW 50060) and a duplicate active label
--              (THROW 50061 — reactivates a soft-deleted one instead of erroring). New
--              labels sort after the current maximum. Returns the created / reactivated
--              row as a single result set. Not an access-gate proc — the controller's
--              Platform-admin AccessGuard is the authoritative check.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateRoleLabel
    @Label       NVARCHAR(120),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @LabelLocal NVARCHAR(120) = LTRIM(RTRIM(@Label));
    DECLARE @Actor      NVARCHAR(256) = @ActorUserId;
    DECLARE @Now        DATETIME2     = SYSUTCDATETIME();

    IF @LabelLocal IS NULL OR @LabelLocal = N''
        THROW 50060, 'A role label cannot be blank.', 1;

    -- Validate BEFORE opening a transaction so a guard THROW never issues a ROLLBACK (keeps the proc
    -- tSQLt-safe). The UX_RoleLabelCatalog_Label filtered-unique index is the concurrency backstop.
    DECLARE @RoleLabelId UNIQUEIDENTIFIER =
        (SELECT TOP (1) RoleLabelId FROM dbo.RoleLabelCatalog WHERE Label = @LabelLocal AND IsDeleted = 0);

    IF @RoleLabelId IS NOT NULL
        THROW 50061, 'That role label already exists.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Reactivate a soft-deleted label of the same name instead of inserting a duplicate.
        SET @RoleLabelId =
            (SELECT TOP (1) RoleLabelId FROM dbo.RoleLabelCatalog WHERE Label = @LabelLocal AND IsDeleted = 1);

        IF @RoleLabelId IS NOT NULL
        BEGIN
            UPDATE dbo.RoleLabelCatalog
            SET IsDeleted = 0, DeletedAt = NULL, UpdatedAt = @Now, UpdatedBy = @Actor
            WHERE RoleLabelId = @RoleLabelId;
        END
        ELSE
        BEGIN
            DECLARE @NextSort INT =
                (SELECT ISNULL(MAX(SortOrder), -1) + 1 FROM dbo.RoleLabelCatalog WHERE IsDeleted = 0);

            SET @RoleLabelId = NEWID();
            INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            VALUES (@RoleLabelId, @LabelLocal, @NextSort, @Actor, @Actor, @Now, @Now);
        END

        SELECT RoleLabelId, Label, SortOrder
        FROM dbo.RoleLabelCatalog
        WHERE RoleLabelId = @RoleLabelId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
