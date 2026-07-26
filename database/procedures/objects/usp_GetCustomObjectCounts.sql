-- =============================================
-- Author:      /dev-build-application (Slice 1a — Custom-object records: storage & schema)
-- Updated:     2026-07-24 (slice 1b) — added the live RecordsCount now that dbo.CustomRecords exists.
-- Description: Returns one row per CUSTOM object in a workspace with its live field and record counts
--              (S30 Objects tab). FieldsCount is the number of active, non-retired dbo.FieldDefinition
--              rows whose ObjectType equals the object's slug (ObjectKey); RecordsCount is the number
--              of active dbo.CustomRecords for the object. Two independent correlated counts (not a
--              double join, which would fan the rows out); an object with no fields/records reports 0.
--              Updated 2026-07-26 (SP3b Slice 1) — includes Global custom objects alongside the
--              workspace's own; both correlated counts scope on the calling @WorkspaceId (never
--              o.WorkspaceId, which is NULL for a Global object) so a Global object reports the
--              calling workspace's own record count. Behavior-identical for a local object, where
--              @WorkspaceId already equals o.WorkspaceId.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCustomObjectCounts
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT o.ObjectDefinitionId,
           FieldsCount =
               (SELECT COUNT(1) FROM dbo.FieldDefinition f
                WHERE f.WorkspaceId = @Ws
                  AND f.ObjectType  = o.ObjectKey
                  AND f.IsDeleted   = 0
                  AND f.IsRetired   = 0),
           RecordsCount =
               (SELECT COUNT(1) FROM dbo.CustomRecords r
                WHERE r.WorkspaceId        = @Ws
                  AND r.ObjectDefinitionId = o.ObjectDefinitionId
                  AND r.IsDeleted          = 0)
    FROM   dbo.ObjectDefinition o
    WHERE  (o.WorkspaceId = @Ws OR o.Location = N'Global')
      AND  o.IsDeleted    = 0;
END;
GO
