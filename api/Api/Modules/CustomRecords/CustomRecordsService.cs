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

        // The object's field schema (keyed by its slug) tells us which filter/sort keys are real user
        // fields and each one's type, so unknown keys are dropped in C# before the proc — defence in
        // depth alongside the proc's own whitelist (usp_QueryCustomRecords).
        var schema = await _fields.GetSchemaAsync(workspaceId, obj.ObjectKey, cancellationToken).ConfigureAwait(false);

        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 20 : query.PageSize > 100 ? 100 : query.PageSize;
        var filtersJson = BuildFiltersJson(query.Filters, schema);
        var (sortColumn, sortDirection) = ResolveSort(query.Sort, schema);

        var rows = await _db.Set<CustomRecordQueryRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_QueryCustomRecords @WorkspaceId, @ObjectDefinitionId, @Page, @PageSize, @FiltersJson, @SortColumn, @SortDir",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectDefinitionId", objectId),
                new SqlParameter("@Page", page),
                new SqlParameter("@PageSize", pageSize),
                new SqlParameter("@FiltersJson", (object?)filtersJson ?? DBNull.Value),
                new SqlParameter("@SortColumn", sortColumn),
                new SqlParameter("@SortDir", sortDirection))
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

    // ─── Filter / sort marshalling (pure — unit-testable without a database) ─────

    // The fixed number-operator allow-set the proc recognises. Emitted only after matching this set,
    // so no caller-supplied operator ever reaches SQL text.
    private static readonly HashSet<string> NumberOperators =
        new(StringComparer.Ordinal) { ">", ">=", "=", "<=", "<" };

    /// <summary>
    /// Translate the record-list filter map into the JSON shape <c>usp_QueryCustomRecords</c> expects —
    /// a JSON object keyed by column key. The stable columns (<c>name</c> / <c>created</c> / <c>updated</c>)
    /// and the object's user fields (each present in <paramref name="schema"/>) are emitted with the
    /// sub-fields the proc reads (<c>contains</c> / <c>values</c> / <c>op</c>+<c>value</c> / <c>from</c>+<c>to</c>)
    /// plus a documentary <c>type</c>; any key that is neither a stable column nor a real field is dropped,
    /// so no unknown key reaches SQL. Returns null when nothing survives. Pure.
    /// </summary>
    public static string? BuildFiltersJson(
        IReadOnlyDictionary<string, JsonElement>? filters, WorkspaceFieldSchemaDto schema)
    {
        if (filters is null || filters.Count == 0)
        {
            return null;
        }

        var fieldKeys = new HashSet<string>(schema.Fields.Select(field => field.FieldKey), StringComparer.Ordinal);
        var payload = new Dictionary<string, object?>(StringComparer.Ordinal);

        foreach (var entry in filters)
        {
            var clause = entry.Value;
            if (clause.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            object? marshalled = entry.Key switch
            {
                "name" => BuildTextClause(clause),
                "created" or "updated" => BuildDateClause(clause),
                _ when fieldKeys.Contains(entry.Key) => BuildFieldClause(clause),
                _ => null,  // unknown key — dropped, never reaches SQL.
            };

            if (marshalled is not null)
            {
                payload[entry.Key] = marshalled;
            }
        }

        return payload.Count == 0 ? null : JsonSerializer.Serialize(payload, JsonOptions);
    }

    /// <summary>
    /// Map the first usable sort directive onto a whitelisted proc sort column — a stable column
    /// (<c>name</c> / <c>created</c> / <c>updated</c>) or one of the object's user field keys (present
    /// in <paramref name="schema"/>); anything else falls back to <c>name</c>. Direction is normalised to
    /// <c>asc</c> / <c>desc</c>. Pure.
    /// </summary>
    public static (string Column, string Direction) ResolveSort(
        IReadOnlyList<SortSpec>? sort, WorkspaceFieldSchemaDto schema)
    {
        var first = sort?.FirstOrDefault(spec => !string.IsNullOrWhiteSpace(spec.Column));
        var requested = first?.Column;
        var column = requested switch
        {
            "name" or "created" or "updated" => requested,
            { } key when schema.Fields.Any(field => string.Equals(field.FieldKey, key, StringComparison.Ordinal)) => key,
            _ => "name",
        };
        var direction = string.Equals(first?.Direction, "desc", StringComparison.OrdinalIgnoreCase) ? "desc" : "asc";
        return (column, direction);
    }

    /// <summary>A user-field clause — dispatched on its own <c>kind</c> (which agrees with the field's
    /// schema type). Boolean / user / unknown kinds are not filterable over the JSON bag → dropped.</summary>
    private static object? BuildFieldClause(JsonElement clause) => ReadStringProperty(clause, "kind") switch
    {
        "text" => BuildTextClause(clause),
        "select" => BuildSelectClause(clause),
        "number" => BuildNumberClause(clause),
        "date" => BuildDateClause(clause),
        _ => null,
    };

    private static object? BuildTextClause(JsonElement clause)
    {
        var contains = ReadStringProperty(clause, "contains");
        return string.IsNullOrEmpty(contains) ? null : new { type = "text", contains };
    }

    private static object? BuildSelectClause(JsonElement clause)
    {
        if (!clause.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var list = ReadStringArray(values);
        return list.Count == 0 ? null : new { type = "select", values = list };
    }

    private static object? BuildNumberClause(JsonElement clause)
    {
        var op = ReadStringProperty(clause, "op");
        if (op is null
            || !NumberOperators.Contains(op)
            || !clause.TryGetProperty("value", out var value)
            || value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        // value is a JsonElement number — serialized verbatim as its raw numeric literal.
        return new { type = "number", op, value };
    }

    private static object? BuildDateClause(JsonElement clause)
    {
        var from = ReadStringProperty(clause, "from");
        var to = ReadStringProperty(clause, "to");
        if (from is null && to is null)
        {
            return null;
        }

        var payload = new Dictionary<string, object?>(StringComparer.Ordinal) { ["type"] = "date" };
        if (from is not null)
        {
            payload["from"] = from;
        }

        if (to is not null)
        {
            payload["to"] = to;
        }

        return payload;
    }

    private static string? ReadStringProperty(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            _ => null,
        };
    }

    private static List<string> ReadStringArray(JsonElement array) =>
        array.EnumerateArray()
            .Where(element => element.ValueKind == JsonValueKind.String)
            .Select(element => element.GetString()!)
            .ToList();

    private static CustomRecordDto MapRow(CustomRecordReadRow row) => new(
        Id: row.RecordId,
        ObjectDefinitionId: row.ObjectDefinitionId,
        Name: row.Name,
        Fields: ParseFields(row.FieldValues),
        CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
        UpdatedAt: DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc),
        CreatedBy: row.CreatedBy,
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
