-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Physically DELETEs a Draft (owner-scoped). Drafts are the sole exception to the
--              no-hard-delete floor (data-model.md §Draft) — they are pre-record and discardable.
--              The @OwnerUserId predicate ensures a caller can only discard their own drafts;
--              a non-owner id is a no-op (0 rows affected → API 403/404).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteDraft
    @DraftId     UNIQUEIDENTIFIER,
    @OwnerUserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @DraftIdLocal UNIQUEIDENTIFIER = @DraftId;
    DECLARE @Owner        UNIQUEIDENTIFIER = @OwnerUserId;

    DELETE FROM dbo.Drafts
    WHERE DraftId = @DraftIdLocal AND OwnerUserId = @Owner;

    SELECT @@ROWCOUNT AS Deleted;
END;
GO
