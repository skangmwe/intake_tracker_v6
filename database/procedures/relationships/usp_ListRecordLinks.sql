-- =============================================
-- Author:      /dev-build-application (Slice 25 — Relationships side panel)
-- Create Date: 2026-07-16
-- Description: Lists RecordLinks for a record (v2-reconciliation.md §API deltas
--              Relationships GET /records/{recordId}/links?relationshipId={rid}). Returns
--              both directions: links where the record is FromRecordId and where it's
--              ToRecordId. When @RelationshipId is provided, filters to that Relationship;
--              when NULL, returns all links for the record.
--
--              To-side rows are marked with Direction='In' (a link where I'm the target);
--              From-side rows with Direction='Out'. The web renders the appropriate side
--              label (fromSideLabel vs toSideLabel).
--
--              Access-gating: WorkspaceId on the record's side is the primary filter.
--              Cross-side visibility (an escalated record's two sides have separate
--              link rosters) is honored by the WorkspaceId scope — the caller sees only
--              the side they can access. Display name for the counterparty record is
--              joined from Requests.Name (best-effort — Feature/Task/ToolkitItem cases
--              can be added when those objects go through this proc).
--
--              Two result sets are NOT returned; a single joined set per direction is
--              simplest, and paging is handled at the API for volumes that exceed a page.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListRecordLinks
    @WorkspaceId    UNIQUEIDENTIFIER,
    @RecordId       NVARCHAR(20),
    @RelationshipId UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Rec    NVARCHAR(20)     = @RecordId;
    DECLARE @RelId  UNIQUEIDENTIFIER = @RelationshipId;

    -- Outgoing (record is FromRecordId).
    SELECT l.RecordLinkId                     AS Id,
           l.RelationshipId,
           l.FromRecordId,
           l.ToRecordId,
           ISNULL(counterparty.Name, l.ToRecordId) AS ToRecordDisplayName,
           counterparty.Stage                 AS ToRecordStage,
           N'Out'                             AS Direction,
           l.CreatedAt,
           l.CreatedBy
    FROM   dbo.RecordLinks l
    LEFT   JOIN dbo.Requests counterparty
           ON  counterparty.RecordId    = l.ToRecordId
           AND counterparty.WorkspaceId = l.WorkspaceId
           AND counterparty.IsDeleted   = 0
    WHERE  l.WorkspaceId  = @Ws
      AND  l.FromRecordId = @Rec
      AND  l.IsDeleted    = 0
      AND  (@RelId IS NULL OR l.RelationshipId = @RelId)

    UNION ALL

    -- Incoming (record is ToRecordId).
    SELECT l.RecordLinkId                     AS Id,
           l.RelationshipId,
           l.FromRecordId,
           l.ToRecordId,
           ISNULL(counterparty.Name, l.FromRecordId) AS ToRecordDisplayName,
           counterparty.Stage                 AS ToRecordStage,
           N'In'                              AS Direction,
           l.CreatedAt,
           l.CreatedBy
    FROM   dbo.RecordLinks l
    LEFT   JOIN dbo.Requests counterparty
           ON  counterparty.RecordId    = l.FromRecordId
           AND counterparty.WorkspaceId = l.WorkspaceId
           AND counterparty.IsDeleted   = 0
    WHERE  l.WorkspaceId  = @Ws
      AND  l.ToRecordId   = @Rec
      AND  l.IsDeleted    = 0
      AND  (@RelId IS NULL OR l.RelationshipId = @RelId)

    ORDER  BY CreatedAt DESC;
END;
GO
