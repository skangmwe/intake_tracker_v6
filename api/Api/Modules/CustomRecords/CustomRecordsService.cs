// Custom-object records service (Slice 1b). Generic CRUD over dbo.CustomRecords for any custom
// object, mirroring RequestsService: every mutation goes through a stored procedure with each dynamic
// value bound as a SqlParameter (never string-built — api-data-access.md). Access (403) is enforced at
// the controller on the route workspace; this service enforces existence (a foreign/absent object or
// record → NotFound → 404, never disclosing existence — api-record-access.md) and light required-field
// validation. The object is resolved (and its slug obtained) via IObjectSchemaService; required field
// keys via IFieldSchemaService — both one-way dependencies (no DI cycle). Field values are Confidential
// and never logged (api-pii-handling.md).

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Modules.Requests; // PaginatedResponse<T>, PaginatedQuery (shared pagination types)
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.CustomRecords;

public interface ICustomRecordsService
{
    /// <summary>The full record, or null when the object or record is out of scope (→ 404).</summary>
    Task<CustomRecordDto?> GetByIdAsync(Guid workspaceId, Guid objectId, Guid recordId, CancellationToken cancellationToken);

    /// <summary>A page of the object's records, or null when the object is out of scope (→ 404).</summary>
    Task<PaginatedResponse<CustomRecordListRow>?> QueryAsync(
        Guid workspaceId, Guid objectId, PaginatedQuery query, CancellationToken cancellationToken);

    Task<CustomRecordWriteResult> CreateAsync(
        Guid workspaceId, Guid objectId, CustomRecordWriteRequest request, Guid actorUserId, CancellationToken cancellationToken);

    Task<CustomRecordWriteResult> PatchAsync(
        Guid workspaceId, Guid objectId, Guid recordId, CustomRecordWriteRequest request, Guid actorUserId, CancellationToken cancellationToken);

    Task<CustomRecordWriteOutcome> DeleteAsync(
        Guid workspaceId, Guid objectId, Guid recordId, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class CustomRecordsService : ICustomRecordsService
{
    // Guard numbers raised by the custom-record procs (see the proc headers).
    private const int ObjectNotFoundError = 50083;  // usp_CreateCustomRecord — object not in workspace.
    private const int RecordNotFoundError = 50043;  // usp_Patch/DeleteCustomRecord — record not in scope.

    // Matches dbo.CustomRecords.Name (NVARCHAR(400)).
    private const int NameMaxLength = 400;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly IReadOnlyDictionary<string, JsonElement> EmptyFields =
        new Dictionary<string, JsonElement>(StringComparer.Ordinal);

    private readonly AppDbContext _db;
    private readonly IObjectSchemaService _objects;
    private readonly IFieldSchemaService _fields;

    public CustomRecordsService(AppDbContext db, IObjectSchemaService objects, IFieldSchemaService fields)
    {
        _db = db;
        _objects = objects;
        _fields = fields;
    }

    public async Task<CustomRecordDto?> GetByIdAsync(
        Guid workspaceId, Guid objectId, Guid recordId, CancellationToken cancellationToken)
    {
        // The object must exist in the workspace, else the record can't (404, never disclose).
        var obj = await _objects.GetByIdAsync(objectId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (obj is null)
        {
            return null;
        }

        var rows = await _db.Set<CustomRecordReadRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetCustomRecordById @RecordId, @WorkspaceId, @ObjectDefinitionId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectDefinitionId", objectId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.FirstOrDefault() is { } row ? MapRow(row) : null;
    }

    public async Task<PaginatedResponse<CustomRecordListRow>?> QueryAsync(
        Guid workspaceId, Guid objectId, PaginatedQuery query, CancellationToken cancellationToken)
    {
        var obj = await _objects.GetByIdAsync(objectId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (obj is null)
        {
            return null;
        }

        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 20 : query.PageSize;

        var rows = await _db.Set<CustomRecordQueryRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_QueryCustomRecords @WorkspaceId, @ObjectDefinitionId, @Page, @PageSize",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectDefinitionId", objectId),
                new SqlParameter("@Page", page),
                new SqlParameter("@PageSize", pageSize))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var totalCount = rows.Count > 0 ? rows[0].TotalCount : 0;
        var items = rows
            .Select(row => new CustomRecordListRow(
                row.RecordId, row.Name, ParseFields(row.FieldValues), Convert.ToBase64String(row.RowVer)))
            .ToList();

        return new PaginatedResponse<CustomRecordListRow>(items, totalCount, page, pageSize);
    }

    public async Task<CustomRecordWriteResult> CreateAsync(
        Guid workspaceId, Guid objectId, CustomRecordWriteRequest request, Guid actorUserId, CancellationToken cancellationToken)
    {
        var obj = await _objects.GetByIdAsync(objectId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (obj is null)
        {
            return new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound);
        }

        var errors = await ValidateAsync(workspaceId, obj.ObjectKey, request, cancellationToken).ConfigureAwait(false);
        if (errors.Count > 0)
        {
            return new CustomRecordWriteResult(CustomRecordWriteOutcome.ValidationFailed, Errors: errors);
        }

        var recordIdParameter = new SqlParameter("@RecordId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_CreateCustomRecord @WorkspaceId, @ObjectDefinitionId, @Name, @FieldValuesJson, @ActorUserId, @RecordId OUTPUT",
                new object[]
                {
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@ObjectDefinitionId", objectId),
                    new SqlParameter("@Name", request.Name ?? string.Empty),
                    new SqlParameter("@FieldValuesJson", SerializeFields(request.Fields)),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    recordIdParameter,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ObjectNotFoundError)
        {
            return new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound);
        }

        var newId = (Guid)recordIdParameter.Value!;
        var dto = await GetByIdAsync(workspaceId, objectId, newId, cancellationToken).ConfigureAwait(false);
        return new CustomRecordWriteResult(CustomRecordWriteOutcome.Success, dto);
    }

    public async Task<CustomRecordWriteResult> PatchAsync(
        Guid workspaceId, Guid objectId, Guid recordId, CustomRecordWriteRequest request, Guid actorUserId, CancellationToken cancellationToken)
    {
        var obj = await _objects.GetByIdAsync(objectId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (obj is null)
        {
            return new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound);
        }

        var errors = await ValidateAsync(workspaceId, obj.ObjectKey, request, cancellationToken).ConfigureAwait(false);
        if (errors.Count > 0)
        {
            return new CustomRecordWriteResult(CustomRecordWriteOutcome.ValidationFailed, Errors: errors);
        }

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_PatchCustomRecord @RecordId, @WorkspaceId, @ObjectDefinitionId, @Name, @FieldValuesJson, @ActorUserId",
                new object[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@ObjectDefinitionId", objectId),
                    new SqlParameter("@Name", request.Name ?? string.Empty),
                    new SqlParameter("@FieldValuesJson", SerializeFields(request.Fields)),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == RecordNotFoundError)
        {
            return new CustomRecordWriteResult(CustomRecordWriteOutcome.NotFound);
        }

        var dto = await GetByIdAsync(workspaceId, objectId, recordId, cancellationToken).ConfigureAwait(false);
        return new CustomRecordWriteResult(CustomRecordWriteOutcome.Success, dto);
    }

    public async Task<CustomRecordWriteOutcome> DeleteAsync(
        Guid workspaceId, Guid objectId, Guid recordId, Guid actorUserId, CancellationToken cancellationToken)
    {
        var obj = await _objects.GetByIdAsync(objectId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (obj is null)
        {
            return CustomRecordWriteOutcome.NotFound;
        }

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_DeleteCustomRecord @RecordId, @WorkspaceId, @ObjectDefinitionId, @ActorUserId",
                new object[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@ObjectDefinitionId", objectId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == RecordNotFoundError)
        {
            return CustomRecordWriteOutcome.NotFound;
        }

        return CustomRecordWriteOutcome.Success;
    }

    private async Task<Dictionary<string, string[]>> ValidateAsync(
        Guid workspaceId, string objectKey, CustomRecordWriteRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = new[] { "A record name is required." };
        }
        else if (request.Name.Length > NameMaxLength)
        {
            // Match dbo.CustomRecords.Name (NVARCHAR(400)) so an over-long name is a clean 400, not a
            // truncation error surfaced as 500.
            errors["name"] = new[] { $"A record name must be {NameMaxLength} characters or fewer." };
        }

        var requiredKeys = await _fields
            .GetRequiredFieldKeysAsync(workspaceId, objectKey, cancellationToken).ConfigureAwait(false);
        foreach (var entry in ValidateRequiredFields(requiredKeys, request.Fields))
        {
            errors[entry.Key] = entry.Value;
        }

        return errors;
    }

    /// <summary>The light required-field presence check (v1): every required field key must be present
    /// and non-empty in the submitted map. Pure — unit-testable without a database.</summary>
    public static Dictionary<string, string[]> ValidateRequiredFields(
        IReadOnlyList<string> requiredKeys, IReadOnlyDictionary<string, JsonElement>? fields)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        foreach (var key in requiredKeys)
        {
            if (fields is null || !fields.TryGetValue(key, out var element) || IsEmpty(element))
            {
                errors[key] = new[] { $"'{key}' is required." };
            }
        }

        return errors;
    }

    private static bool IsEmpty(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => true,
        JsonValueKind.String => string.IsNullOrWhiteSpace(element.GetString()),
        JsonValueKind.Array => element.GetArrayLength() == 0,
        _ => false,
    };

    private static CustomRecordDto MapRow(CustomRecordReadRow row) => new(
        Id: row.RecordId,
        ObjectDefinitionId: row.ObjectDefinitionId,
        Name: row.Name,
        Fields: ParseFields(row.FieldValues),
        CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
        UpdatedAt: DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc),
        ETag: Convert.ToBase64String(row.RowVer));

    private static string SerializeFields(IReadOnlyDictionary<string, JsonElement>? fields) =>
        JsonSerializer.Serialize(fields ?? EmptyFields, JsonOptions);

    private static Dictionary<string, JsonElement> ParseFields(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, JsonOptions)
                ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            return new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        }
    }
}
