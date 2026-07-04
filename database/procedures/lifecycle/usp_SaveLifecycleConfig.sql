-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Reconciles a workspace's whole lifecycle/stage/gate/slot structure (S31) in
--              one transaction from a JSON payload. Present rows are upserted; rows absent
--              from the payload are soft-retired. Everything is soft-delete (no physical
--              DELETE), so FK integrity holds throughout the reconcile.
--
--              Guards (THROW): the payload must name EXACTLY ONE default lifecycle, and
--              every gate's from/to stage key must resolve to a stage in the SAME lifecycle.
--
--              @LifecyclesJson shape:
--                [ { "id"?, "name", "requestType", "isDefault", "sortOrder",
--                    "stages": [ { "id"?, "key", "label", "statusCategory", "sortOrder" } ],
--                    "gates":  [ { "id"?, "name", "fromStageKey", "toStageKey", "sortOrder",
--                                  "slots": [ { "roleLabel" } ] } ] } ]
--              New rows omit "id" (the proc mints one). No result set — the caller re-reads.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SaveLifecycleConfig
    @WorkspaceId    UNIQUEIDENTIFIER,
    @LifecyclesJson NVARCHAR(MAX),
    @ActorUserId    NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ── Parse the payload into resolved-id temp tables ───────────────────
        CREATE TABLE #Lc (
            LcIdx INT, LifecycleId UNIQUEIDENTIFIER, Name NVARCHAR(200), RequestType NVARCHAR(120),
            IsDefault BIT, SortOrder INT, StagesJson NVARCHAR(MAX), GatesJson NVARCHAR(MAX));

        INSERT INTO #Lc (LcIdx, LifecycleId, Name, RequestType, IsDefault, SortOrder, StagesJson, GatesJson)
        SELECT
            CAST(lc.[key] AS INT),
            COALESCE(TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(lc.value, '$.id')), NEWID()),
            JSON_VALUE(lc.value, '$.name'),
            JSON_VALUE(lc.value, '$.requestType'),
            CASE WHEN JSON_VALUE(lc.value, '$.isDefault') IN (N'true', N'1') THEN 1 ELSE 0 END,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(lc.value, '$.sortOrder')), 0),
            JSON_QUERY(lc.value, '$.stages'),
            JSON_QUERY(lc.value, '$.gates')
        FROM OPENJSON(@LifecyclesJson) AS lc;

        DECLARE @DefaultCount INT = (SELECT COUNT(*) FROM #Lc WHERE IsDefault = 1);
        IF @DefaultCount <> 1
            THROW 50023, 'Exactly one lifecycle must be marked as the default.', 1;

        DECLARE @DefaultLc UNIQUEIDENTIFIER = (SELECT TOP (1) LifecycleId FROM #Lc WHERE IsDefault = 1);

        CREATE TABLE #Stg (
            LifecycleId UNIQUEIDENTIFIER, StageDefinitionId UNIQUEIDENTIFIER, StageKey NVARCHAR(64),
            Label NVARCHAR(120), StatusCategory NVARCHAR(16), SortOrder INT);

        INSERT INTO #Stg (LifecycleId, StageDefinitionId, StageKey, Label, StatusCategory, SortOrder)
        SELECT
            lc.LifecycleId,
            COALESCE(TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(st.value, '$.id')), NEWID()),
            JSON_VALUE(st.value, '$.key'),
            JSON_VALUE(st.value, '$.label'),
            JSON_VALUE(st.value, '$.statusCategory'),
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(st.value, '$.sortOrder')), 0)
        FROM #Lc AS lc
        CROSS APPLY OPENJSON(lc.StagesJson) AS st;

        CREATE TABLE #Gate (
            LifecycleId UNIQUEIDENTIFIER, GateDefinitionId UNIQUEIDENTIFIER, Name NVARCHAR(200),
            FromStageKey NVARCHAR(64), ToStageKey NVARCHAR(64),
            FromStageId UNIQUEIDENTIFIER, ToStageId UNIQUEIDENTIFIER, SortOrder INT, SlotsJson NVARCHAR(MAX));

        INSERT INTO #Gate (LifecycleId, GateDefinitionId, Name, FromStageKey, ToStageKey, SortOrder, SlotsJson)
        SELECT
            lc.LifecycleId,
            COALESCE(TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(gt.value, '$.id')), NEWID()),
            JSON_VALUE(gt.value, '$.name'),
            JSON_VALUE(gt.value, '$.fromStageKey'),
            JSON_VALUE(gt.value, '$.toStageKey'),
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(gt.value, '$.sortOrder')), 0),
            JSON_QUERY(gt.value, '$.slots')
        FROM #Lc AS lc
        CROSS APPLY OPENJSON(lc.GatesJson) AS gt;

        -- Resolve gate stage keys to ids within the same lifecycle.
        UPDATE gate
        SET FromStageId = fromStage.StageDefinitionId,
            ToStageId   = toStage.StageDefinitionId
        FROM #Gate AS gate
        LEFT JOIN #Stg AS fromStage ON fromStage.LifecycleId = gate.LifecycleId AND fromStage.StageKey = gate.FromStageKey
        LEFT JOIN #Stg AS toStage   ON toStage.LifecycleId   = gate.LifecycleId AND toStage.StageKey   = gate.ToStageKey;

        IF EXISTS (SELECT 1 FROM #Gate WHERE FromStageId IS NULL OR ToStageId IS NULL)
            THROW 50022, 'A gate references a stage that is not part of its lifecycle.', 1;

        CREATE TABLE #Slot (GateDefinitionId UNIQUEIDENTIFIER, RoleLabel NVARCHAR(120), SlotIndex INT);

        INSERT INTO #Slot (GateDefinitionId, RoleLabel, SlotIndex)
        SELECT gate.GateDefinitionId, JSON_VALUE(sl.value, '$.roleLabel'), CAST(sl.[key] AS INT)
        FROM #Gate AS gate
        CROSS APPLY OPENJSON(gate.SlotsJson) AS sl;

        -- ── Apply: lifecycles (default forced 0 here; set once at the end) ────
        UPDATE lc
        SET Name = src.Name, RequestType = src.RequestType, SortOrder = src.SortOrder,
            IsDefault = 0, UpdatedBy = @Actor, UpdatedAt = @Now, IsDeleted = 0, DeletedAt = NULL
        FROM dbo.Lifecycle AS lc
        INNER JOIN #Lc AS src ON src.LifecycleId = lc.LifecycleId
        WHERE lc.WorkspaceId = @Ws;

        INSERT INTO dbo.Lifecycle (LifecycleId, WorkspaceId, Name, RequestType, IsDefault, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT src.LifecycleId, @Ws, src.Name, src.RequestType, 0, src.SortOrder, @Actor, @Actor, @Now, @Now
        FROM #Lc AS src
        WHERE NOT EXISTS (SELECT 1 FROM dbo.Lifecycle AS lc WHERE lc.LifecycleId = src.LifecycleId);

        -- Retire workspace lifecycles no longer present.
        UPDATE lc
        SET IsDeleted = 1, DeletedAt = @Now, IsDefault = 0, UpdatedBy = @Actor, UpdatedAt = @Now
        FROM dbo.Lifecycle AS lc
        WHERE lc.WorkspaceId = @Ws AND lc.IsDeleted = 0
          AND NOT EXISTS (SELECT 1 FROM #Lc AS src WHERE src.LifecycleId = lc.LifecycleId);

        -- ── Apply: stages ────────────────────────────────────────────────────
        UPDATE stg
        SET LifecycleId = src.LifecycleId, StageKey = src.StageKey, Label = src.Label,
            StatusCategory = src.StatusCategory, SortOrder = src.SortOrder,
            UpdatedBy = @Actor, UpdatedAt = @Now, IsDeleted = 0, DeletedAt = NULL
        FROM dbo.StageDefinition AS stg
        INNER JOIN #Stg AS src ON src.StageDefinitionId = stg.StageDefinitionId
        WHERE stg.WorkspaceId = @Ws;

        INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT src.StageDefinitionId, src.LifecycleId, @Ws, src.StageKey, src.Label, src.StatusCategory, src.SortOrder, @Actor, @Actor, @Now, @Now
        FROM #Stg AS src
        WHERE NOT EXISTS (SELECT 1 FROM dbo.StageDefinition AS stg WHERE stg.StageDefinitionId = src.StageDefinitionId);

        UPDATE stg
        SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        FROM dbo.StageDefinition AS stg
        WHERE stg.WorkspaceId = @Ws AND stg.IsDeleted = 0
          AND NOT EXISTS (SELECT 1 FROM #Stg AS src WHERE src.StageDefinitionId = stg.StageDefinitionId);

        -- ── Apply: gates ─────────────────────────────────────────────────────
        UPDATE gate
        SET LifecycleId = src.LifecycleId, Name = src.Name, FromStageId = src.FromStageId,
            ToStageId = src.ToStageId, SortOrder = src.SortOrder,
            UpdatedBy = @Actor, UpdatedAt = @Now, IsDeleted = 0, DeletedAt = NULL
        FROM dbo.GateDefinition AS gate
        INNER JOIN #Gate AS src ON src.GateDefinitionId = gate.GateDefinitionId
        WHERE gate.WorkspaceId = @Ws;

        INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT src.GateDefinitionId, src.LifecycleId, @Ws, src.Name, src.FromStageId, src.ToStageId, N'and', src.SortOrder, @Actor, @Actor, @Now, @Now
        FROM #Gate AS src
        WHERE NOT EXISTS (SELECT 1 FROM dbo.GateDefinition AS gate WHERE gate.GateDefinitionId = src.GateDefinitionId);

        UPDATE gate
        SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        FROM dbo.GateDefinition AS gate
        WHERE gate.WorkspaceId = @Ws AND gate.IsDeleted = 0
          AND NOT EXISTS (SELECT 1 FROM #Gate AS src WHERE src.GateDefinitionId = gate.GateDefinitionId);

        -- ── Apply: slots (replace wholesale per workspace gate) ──────────────
        UPDATE slot
        SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
        FROM dbo.GateApproverSlot AS slot
        INNER JOIN dbo.GateDefinition AS gate ON gate.GateDefinitionId = slot.GateDefinitionId
        WHERE gate.WorkspaceId = @Ws AND slot.IsDeleted = 0;

        INSERT INTO dbo.GateApproverSlot (GateDefinitionId, RoleLabel, SlotIndex, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT src.GateDefinitionId, src.RoleLabel, src.SlotIndex, @Actor, @Actor, @Now, @Now
        FROM #Slot AS src;

        -- ── Set the single default last (avoids a transient duplicate) ───────
        UPDATE dbo.Lifecycle SET IsDefault = 1, UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE LifecycleId = @DefaultLc AND WorkspaceId = @Ws;

        DROP TABLE #Slot;
        DROP TABLE #Gate;
        DROP TABLE #Stg;
        DROP TABLE #Lc;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
