-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Returns a single row of live Records/Fields counts for the five BUILT-IN
--              objects, scoped to a workspace (S30 Objects tab). ObjectSchemaService composes
--              these onto the built-in object constants. Records come from each object's
--              backing table (soft-delete-filtered); Fields come from dbo.FieldDefinition
--              (active, non-retired). Attachment and Toolkit item have no field schema
--              (FieldDefinition only allows Request/Task/Feature), so the service sets their
--              Fields count to 0 — they are not returned here.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetObjectRecordCounts
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        RequestRecords    = (SELECT COUNT(1) FROM dbo.Requests    WHERE WorkspaceId = @Ws AND IsDeleted = 0),
        TaskRecords       = (SELECT COUNT(1) FROM dbo.Tasks       WHERE WorkspaceId = @Ws AND IsDeleted = 0),
        AttachmentRecords = (SELECT COUNT(1) FROM dbo.Attachments WHERE WorkspaceId = @Ws AND IsDeleted = 0),
        FeatureRecords    = (SELECT COUNT(1) FROM dbo.Features    WHERE WorkspaceId = @Ws AND IsDeleted = 0),
        ToolkitRecords    = (SELECT COUNT(1) FROM dbo.ToolkitItem WHERE WorkspaceId = @Ws AND IsDeleted = 0),
        RequestFields     = (SELECT COUNT(1) FROM dbo.FieldDefinition WHERE WorkspaceId = @Ws AND ObjectType = N'Request' AND IsDeleted = 0 AND IsRetired = 0),
        TaskFields        = (SELECT COUNT(1) FROM dbo.FieldDefinition WHERE WorkspaceId = @Ws AND ObjectType = N'Task'    AND IsDeleted = 0 AND IsRetired = 0),
        FeatureFields     = (SELECT COUNT(1) FROM dbo.FieldDefinition WHERE WorkspaceId = @Ws AND ObjectType = N'Feature' AND IsDeleted = 0 AND IsRetired = 0);
END;
GO
