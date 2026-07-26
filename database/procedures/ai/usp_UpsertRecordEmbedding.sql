-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 2 retrieval)
-- Create Date: 2026-07-25
-- Description: Upserts one record's embedding, keyed on (ObjectType, RecordId). Replaces the vector, content
--              hash, model, dimensions and timestamp when a live row exists; inserts otherwise. Idempotent —
--              the refresh sweep re-runs safely; the ContentHash on the row lets the sweep skip unchanged
--              records so a re-run with the same content is a no-op upstream. Parameterized; MERGE per the
--              sanctioned upsert pattern (database-stored-procedures.md), guarded by TRY/CATCH + transaction.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertRecordEmbedding
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64),
    @RecordId    NVARCHAR(64),
    @Model       NVARCHAR(64),
    @Dimensions  INT,
    @Vector      VARBINARY(MAX),
    @ContentHash CHAR(64),
    @EmbeddedAt  DATETIME2,
    @By          NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Type  NVARCHAR(64)     = @ObjectType;
    DECLARE @Rec   NVARCHAR(64)     = @RecordId;
    DECLARE @Mdl   NVARCHAR(64)     = @Model;
    DECLARE @Dims  INT              = @Dimensions;
    DECLARE @Vec   VARBINARY(MAX)   = @Vector;
    DECLARE @Hash  CHAR(64)         = @ContentHash;
    DECLARE @When  DATETIME2        = @EmbeddedAt;
    DECLARE @Actor NVARCHAR(256)    = @By;

    BEGIN TRY
        BEGIN TRANSACTION;

        MERGE dbo.RecordEmbedding AS target
        USING (SELECT @Ws AS WorkspaceId, @Type AS ObjectType, @Rec AS RecordId) AS source
            ON target.WorkspaceId = source.WorkspaceId
           AND target.ObjectType = source.ObjectType
           AND target.RecordId = source.RecordId
           AND target.IsDeleted = 0
        WHEN MATCHED THEN
            UPDATE SET
                target.Model       = @Mdl,
                target.Dimensions  = @Dims,
                target.Vector      = @Vec,
                target.ContentHash = @Hash,
                target.EmbeddedAt  = @When,
                target.UpdatedAt   = SYSUTCDATETIME(),
                target.UpdatedBy   = @Actor
        WHEN NOT MATCHED THEN
            INSERT (WorkspaceId, ObjectType, RecordId, Model, Dimensions, Vector, ContentHash, EmbeddedAt, CreatedBy, UpdatedBy)
            VALUES (@Ws, @Type, @Rec, @Mdl, @Dims, @Vec, @Hash, @When, @Actor, @Actor);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
