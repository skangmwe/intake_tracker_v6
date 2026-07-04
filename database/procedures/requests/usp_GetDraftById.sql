-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Returns one Draft by id, scoped to its owner (@OwnerUserId is the access
--              boundary). Zero rows when the draft does not exist or belongs to someone else,
--              so the API returns 403/404 without disclosing another user's draft.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDraftById
    @DraftId     UNIQUEIDENTIFIER,
    @OwnerUserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @DraftIdLocal UNIQUEIDENTIFIER = @DraftId;
    DECLARE @Owner        UNIQUEIDENTIFIER = @OwnerUserId;

    SELECT DraftId, OwnerUserId, WorkspaceId, ObjectType, Title, Body, LastEditedAt, CreatedAt
    FROM dbo.Drafts
    WHERE DraftId = @DraftIdLocal AND OwnerUserId = @Owner;
END;
GO
