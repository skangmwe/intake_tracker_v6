-- =============================================
-- Author:      /dev-build-application (Slice: triggers-request-authoring, Task 2.1)
-- Create Date: 2026-07-24
-- Description: Create or update one trigger and replace its condition rows atomically. On create,
--              @TriggerId is NULL and a new id is minted. On update, the trigger row is updated only when
--              it belongs to @WorkspaceId (cross-workspace writes are ignored). Conditions are replaced
--              wholesale (soft-delete existing, insert the supplied set from @ConditionsJson) — the same
--              replace semantics the field-rule editor uses. Returns the trigger id.
--              Validation of business rules (comparator set, non-empty recipients, etc.) is done by the
--              caller (TriggersService) before this runs.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertScheduledTrigger
    @TriggerId            UNIQUEIDENTIFIER,
    @WorkspaceId          UNIQUEIDENTIFIER,
    @ObjectType           NVARCHAR(64),
    @Kind                 NVARCHAR(32),
    @Name                 NVARCHAR(200),
    @IsEnabled            BIT,
    @Cadence              NVARCHAR(32),
    @RepeatIntervalDays   INT,
    @WindowDays           INT,
    @NotificationCategory NVARCHAR(32),
    @Recipients           NVARCHAR(MAX),
    @NotificationTitle    NVARCHAR(200),
    @NotificationBody     NVARCHAR(MAX),
    @ConditionsJson       NVARCHAR(MAX),
    @By                   NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger UNIQUEIDENTIFIER = @TriggerId;
    DECLARE @Ws      UNIQUEIDENTIFIER = @WorkspaceId;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @Trigger IS NULL
        BEGIN
            SET @Trigger = NEWID();
            INSERT INTO dbo.ScheduledTrigger
                (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence, RepeatIntervalDays,
                 WindowDays, NotificationCategory, Recipients, NotificationTitle, NotificationBody,
                 CreatedBy, UpdatedBy)
            VALUES
                (@Trigger, @Ws, @ObjectType, @Kind, @Name, @IsEnabled, @Cadence, @RepeatIntervalDays,
                 @WindowDays, @NotificationCategory, @Recipients, @NotificationTitle, @NotificationBody,
                 @By, @By);
        END
        ELSE
        BEGIN
            UPDATE dbo.ScheduledTrigger
            SET ObjectType           = @ObjectType,
                Kind                 = @Kind,
                Name                 = @Name,
                IsEnabled            = @IsEnabled,
                Cadence              = @Cadence,
                RepeatIntervalDays   = @RepeatIntervalDays,
                WindowDays           = @WindowDays,
                NotificationCategory = @NotificationCategory,
                Recipients           = @Recipients,
                NotificationTitle    = @NotificationTitle,
                NotificationBody     = @NotificationBody,
                UpdatedAt            = SYSUTCDATETIME(),
                UpdatedBy            = @By
            WHERE TriggerId = @Trigger
              AND WorkspaceId = @Ws
              AND IsDeleted = 0;
        END

        -- Replace the condition set: soft-delete the current rows, insert the supplied set.
        UPDATE dbo.ScheduledTriggerCondition
        SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @By
        WHERE TriggerId = @Trigger AND IsDeleted = 0;

        INSERT INTO dbo.ScheduledTriggerCondition
            (TriggerId, WhenFieldKey, Comparator, CompareValue, SortOrder, CreatedBy, UpdatedBy)
        SELECT
            @Trigger,
            JSON_VALUE(condition.[value], N'$.whenFieldKey'),
            JSON_VALUE(condition.[value], N'$.comparator'),
            JSON_VALUE(condition.[value], N'$.compareValue'),
            CONVERT(INT, condition.[key]),
            @By, @By
        FROM OPENJSON(ISNULL(@ConditionsJson, N'[]')) AS condition
        WHERE JSON_VALUE(condition.[value], N'$.whenFieldKey') IS NOT NULL;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT @Trigger AS TriggerId;
END;
GO
