-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Lists the caller's own Drafts for a workspace, newest-edited first (S26).
--              Owner-scoped: only @OwnerUserId's drafts are returned — drafts have no
--              cross-user visibility (data-model.md §Draft).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDraftsForUser
    @OwnerUserId UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16) = N'Request'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Owner   UNIQUEIDENTIFIER = @OwnerUserId;
    DECLARE @Ws      UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjType NVARCHAR(16)     = @ObjectType;

    SELECT DraftId, OwnerUserId, WorkspaceId, ObjectType, Title, Body, LastEditedAt, CreatedAt
    FROM dbo.Drafts
    WHERE OwnerUserId = @Owner
      AND WorkspaceId = @Ws
      AND ObjectType = @ObjType
    ORDER BY LastEditedAt DESC;
END;
GO
