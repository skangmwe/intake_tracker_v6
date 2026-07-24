-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.3)
-- Create Date: 2026-07-24
-- Description: Upsert one fire watermark after a trigger fires for a record — set LastFiredDate to the
--              sweep date, inserting the row on first fire. Keyed on the live (TriggerId, RecordId).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertTriggerFire
    @TriggerId  UNIQUEIDENTIFIER,
    @RecordId   NVARCHAR(64),
    @FiredDate  DATE,
    @By         NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger UNIQUEIDENTIFIER = @TriggerId;
    DECLARE @Record  NVARCHAR(64)     = @RecordId;
    DECLARE @Fired   DATE             = @FiredDate;
    DECLARE @Actor   NVARCHAR(256)    = @By;

    MERGE dbo.ScheduledTriggerFire AS target
    USING (SELECT @Trigger AS TriggerId, @Record AS RecordId) AS src
        ON target.TriggerId = src.TriggerId
       AND target.RecordId  = src.RecordId
       AND target.IsDeleted = 0
    WHEN MATCHED THEN
        UPDATE SET LastFiredDate = @Fired, UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @Actor
    WHEN NOT MATCHED THEN
        INSERT (TriggerId, RecordId, LastFiredDate, CreatedBy, UpdatedBy)
        VALUES (src.TriggerId, src.RecordId, @Fired, @Actor, @Actor);
END;
GO
