-- =============================================
-- Author:      /dev-build-application (Slice 10 — Typed links)
-- Create Date: 2026-07-04
-- Description: Adds a typed link from @FromRecordId to @ToRecordId (BS §2.2). Access to the FROM
--              record is gated API-side (the caller must be able to see it) before this runs.
--
--              Validation (business rules, api-contracts.md §9):
--                * The target record must exist as a Request row (THROW 50060 otherwise) — a link
--                  to a non-existent record is never created.
--                * duplicate-of requires the target to share the source's originating workspace
--                  (same id prefix — the "workspace family" test); THROW 50061 otherwise. Because an
--                  escalated record's PG and AI copies share the canonical id, the PG↔AI counterpart
--                  is the same prefix and is therefore permitted.
--                * sourced-from is intentionally lenient in Phase 1 — its only legal source is a
--                  Feature (slice 14), which does not exist yet; the kind is accepted and not
--                  Feature-origin-enforced until Features ship.
--
--              Returns the created link resolved for the caller (far-record name/stage null when the
--              caller cannot see the far side), the same shape usp_GetTypedLinksForRecord projects.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateTypedLink
    @FromRecordId NVARCHAR(20),
    @ToRecordId   NVARCHAR(20),
    @LinkKind     NVARCHAR(32),
    @Rationale    NVARCHAR(MAX) = NULL,
    @UserId       UNIQUEIDENTIFIER,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @From   NVARCHAR(20)     = @FromRecordId;
    DECLARE @To     NVARCHAR(20)     = @ToRecordId;
    DECLARE @Kind   NVARCHAR(32)     = @LinkKind;
    DECLARE @Why    NVARCHAR(MAX)    = @Rationale;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;
    DECLARE @Actor  NVARCHAR(256)    = @ActorUserId;
    DECLARE @LinkId UNIQUEIDENTIFIER;

    IF @From = @To
        THROW 50062, N'usp_CreateTypedLink: a record cannot link to itself.', 1;

    -- The target must exist somewhere as a Request (RecordId is shared across the bridge, so a
    -- single id can name up to two rows; EXISTS is sufficient).
    IF NOT EXISTS (SELECT 1 FROM dbo.Requests WHERE RecordId = @To AND IsDeleted = 0)
        THROW 50060, N'usp_CreateTypedLink: the target record does not exist.', 1;

    -- duplicate-of stays within the same workspace family (same id prefix).
    IF @Kind = N'duplicate-of'
       AND LEFT(@From, CHARINDEX(N'-', @From + N'-') - 1) <> LEFT(@To, CHARINDEX(N'-', @To + N'-') - 1)
        THROW 50061, N'usp_CreateTypedLink: a duplicate-of link must target the same workspace family.', 1;

    SET @LinkId = NEWID();

    INSERT INTO dbo.TypedLinks (LinkId, FromRecordId, ToRecordId, LinkKind, Rationale, CreatedBy, UpdatedBy)
    VALUES (@LinkId, @From, @To, @Kind, @Why, @Actor, @Actor);

    -- Project the created link resolved for the caller. The far record's name/stage are revealed
    -- only when the caller is a member of the workspace that holds a row for @ToRecordId; otherwise
    -- NULL (the link shows, but only the id is disclosed — BS §22.6).
    SELECT
        tl.LinkId,
        tl.FromRecordId,
        tl.ToRecordId,
        tl.LinkKind,
        tl.Rationale,
        far.Name  AS ToName,
        far.Stage AS ToStage,
        tl.CreatedAt
    FROM dbo.TypedLinks AS tl
    OUTER APPLY (
        SELECT TOP (1) r.Name, r.Stage
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
        WHERE r.RecordId = tl.ToRecordId AND r.IsDeleted = 0
    ) AS far
    WHERE tl.LinkId = @LinkId;
END;
GO
