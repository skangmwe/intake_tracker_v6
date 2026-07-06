-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Renames a role label in the platform RoleLabelCatalog (S37 — BS §7.2).
--              Forward-only: a rename changes the CATALOG label only. Past sign-offs keep
--              the label they were captured under (frozen on ApprovalRequest) and live gate
--              slots / approver-team rows store the OLD label string verbatim — this proc
--              deliberately does NOT rewrite GateApproverSlot / ApproverTeamMembership, so
--              history and in-flight gates are untouched (BS §7.2 "renames don't rewrite
--              history"). Trims the new label; rejects blank (THROW 50060), an unknown id
--              (THROW 50062), and a collision with a different active label (THROW 50061).
--              Returns the updated row. Not an access-gate proc.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RenameRoleLabel
    @RoleLabelId UNIQUEIDENTIFIER,
    @Label       NVARCHAR(120),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id         UNIQUEIDENTIFIER = @RoleLabelId;
    DECLARE @LabelLocal NVARCHAR(120)    = LTRIM(RTRIM(@Label));
    DECLARE @Actor      NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now        DATETIME2        = SYSUTCDATETIME();

    IF @LabelLocal IS NULL OR @LabelLocal = N''
        THROW 50060, 'A role label cannot be blank.', 1;

    -- Validate BEFORE opening a transaction so a guard THROW never issues a ROLLBACK (tSQLt-safe).
    IF NOT EXISTS (SELECT 1 FROM dbo.RoleLabelCatalog WHERE RoleLabelId = @Id AND IsDeleted = 0)
        THROW 50062, 'That role label does not exist.', 1;

    IF EXISTS (SELECT 1 FROM dbo.RoleLabelCatalog WHERE Label = @LabelLocal AND RoleLabelId <> @Id AND IsDeleted = 0)
        THROW 50061, 'That role label already exists.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.RoleLabelCatalog
        SET Label = @LabelLocal, UpdatedAt = @Now, UpdatedBy = @Actor
        WHERE RoleLabelId = @Id;

        SELECT RoleLabelId, Label, SortOrder
        FROM dbo.RoleLabelCatalog
        WHERE RoleLabelId = @Id;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
