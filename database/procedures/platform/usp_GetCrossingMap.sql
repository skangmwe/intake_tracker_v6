-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Returns the firm crossing map (S35, read-only in R1 Phase 1 — BS §6.2). Each row
--              is a PG→AI field pair: the PG/Dept template's Request crossing field ([S],
--              Category='Crossing') joined to the AI Solutions workspace field its
--              CrossingToFieldKey points at (the 1:1 seed target). Both workspaces are resolved
--              by Kind (no hard-coded seed GUIDs). Retired / soft-deleted fields on either side
--              are excluded (a retired mapping does not cross — forward-only). Ordered by the
--              source field's SortOrder for a stable display.
--
--              Phase 1 has no CrossingMap table — the crossing map lives on FieldDefinition
--              (data-model.md, slice 9's usp_GetCrossingFields precedent). The durable
--              propose/confirm CrossingMap table is slice 24 (Phase 2). Not an access-gate proc:
--              the controller's Platform-admin AccessGuard is the authoritative check.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCrossingMap
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @AiWorkspaceId       UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'ai-solutions' AND IsDeleted = 0);
    DECLARE @TemplateWorkspaceId UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'pg-dept-template' AND IsDeleted = 0);

    SELECT
        src.FieldKey        AS SourceFieldKey,
        src.DisplayName     AS SourceDisplayName,
        src.FieldType       AS SourceFieldType,
        tgt.FieldKey        AS TargetFieldKey,
        tgt.DisplayName     AS TargetDisplayName,
        tgt.FieldType       AS TargetFieldType
    FROM dbo.FieldDefinition AS src
    INNER JOIN dbo.FieldDefinition AS tgt
        ON tgt.WorkspaceId = @AiWorkspaceId
       AND tgt.ObjectType = N'Request'
       AND tgt.FieldKey = src.CrossingToFieldKey
       AND tgt.IsRetired = 0
       AND tgt.IsDeleted = 0
    WHERE src.WorkspaceId = @TemplateWorkspaceId
      AND src.ObjectType = N'Request'
      AND src.Category = N'Crossing'
      AND src.CrossingToFieldKey IS NOT NULL
      AND src.IsRetired = 0
      AND src.IsDeleted = 0
    ORDER BY src.SortOrder;
END;
GO
