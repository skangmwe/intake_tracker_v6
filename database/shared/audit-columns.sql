-- Shared audit-columns fragment.
-- Included by every migration that creates a new table per database-coding-standards.md.
-- Copy the block below into a new table's column list. Do not deviate.

/*
CreatedAt   DATETIME2      NOT NULL CONSTRAINT DF_{TableName}_CreatedAt DEFAULT SYSUTCDATETIME(),
UpdatedAt   DATETIME2      NOT NULL CONSTRAINT DF_{TableName}_UpdatedAt DEFAULT SYSUTCDATETIME(),
CreatedBy   NVARCHAR(256)  NOT NULL,
UpdatedBy   NVARCHAR(256)  NOT NULL,
IsDeleted   BIT            NOT NULL CONSTRAINT DF_{TableName}_IsDeleted DEFAULT 0,
DeletedAt   DATETIME2      NULL
*/
