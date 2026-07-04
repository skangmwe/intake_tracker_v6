-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns the platform-defined field catalog (BS §4.3, §17.1) — the
--              read-only band that renders in every workspace's Fields & objects (S30)
--              and the surface a Platform admin edits in S34. One central definition per
--              firm. Soft-deleted rows excluded. Read-only projection (not an access-gate
--              proc — the API verifies IsPlatformAdmin separately).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetPlatformFields
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.PlatformFieldId    AS PlatformFieldId,
        p.FieldKey           AS FieldKey,
        p.DisplayName        AS DisplayName,
        p.FieldType          AS FieldType,
        p.Category           AS Category,
        p.IsSystemImmutable  AS IsSystemImmutable,
        p.HasManualWritePath AS HasManualWritePath,
        p.SelectOptionsJson  AS SelectOptionsJson
    FROM dbo.PlatformField AS p
    WHERE p.IsDeleted = 0
    ORDER BY p.DisplayName;
END;
GO
