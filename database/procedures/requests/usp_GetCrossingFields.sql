-- =============================================
-- Author:      /dev-build-application (Slice 9 — Escalation bridge)
-- Create Date: 2026-07-04
-- Description: Returns a workspace's Request crossing fields ([S]) — the crossing map, marked on
--              FieldDefinition (Category='Crossing', BS §6.2). The Escalation module reads this to
--              know which field values to snapshot on the PG side and map into the AI-side row.
--              CrossingToFieldKey is the 1:1 AI-side target key (same key on the seed map).
--              Retired and soft-deleted fields are excluded — a field retired before escalation
--              never crosses (forward-only). Ordered by SortOrder for a stable snapshot order.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCrossingFields
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        fd.FieldKey,
        fd.CrossingToFieldKey,
        fd.DisplayName,
        fd.IsRequired
    FROM dbo.FieldDefinition AS fd
    WHERE fd.WorkspaceId = @Ws
      AND fd.ObjectType = N'Request'
      AND fd.Category = N'Crossing'
      AND fd.IsRetired = 0
      AND fd.IsDeleted = 0
    ORDER BY fd.SortOrder;
END;
GO
