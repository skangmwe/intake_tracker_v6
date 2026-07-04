-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Resolves one task-library field (S30 — a FieldDefinition with ObjectType='Task') by
--              id, scoped to a workspace. The Tasks module calls this when a Task captures a typed
--              field: it validates the field really belongs to the workspace's task library
--              (never trusting client-supplied field metadata) and returns the DisplayName (copied
--              onto the Task as the label) plus the FieldType (to confirm the captured value's kind
--              matches). Returns zero rows when the field does not exist / is not a Task field on
--              that workspace.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTaskField
    @WorkspaceId       UNIQUEIDENTIFIER,
    @FieldDefinitionId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws  UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Fid UNIQUEIDENTIFIER = @FieldDefinitionId;

    SELECT TOP 1
        d.FieldDefinitionId,
        d.DisplayName,
        d.FieldType
    FROM dbo.FieldDefinition AS d
    WHERE d.FieldDefinitionId = @Fid
      AND d.WorkspaceId = @Ws
      AND d.ObjectType = N'Task'
      AND d.IsDeleted = 0;
END;
GO
