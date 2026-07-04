-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns the full field-rule dependency edge list for one
--              (WorkspaceId, ObjectType). The API's ConditionEngine reads this to run the
--              acyclic + depth<=3 check at save (§3.1) BEFORE persisting a field change.
--              Soft-deleted edges excluded. Read-only projection.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldDependencies
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;

    SELECT
        e.FromFieldKey AS FromFieldKey,
        e.ToFieldKey   AS ToFieldKey
    FROM dbo.FieldRuleDependency AS e
    WHERE e.WorkspaceId = @WorkspaceIdLocal
      AND e.ObjectType = @ObjectTypeLocal
      AND e.IsDeleted = 0;
END;
GO
