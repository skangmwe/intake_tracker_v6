// Assembles a workspace's field schema (S30) from the field-schema stored procedures and
// applies field edits. Reads go through procs (joins → api-data-access.md) bound to keyless
// projections; writes go through usp_UpsertFieldDefinition / usp_RetireFieldDefinition. Before
// persisting a field, the dependency graph is validated acyclic + depth<=3 via the ConditionEngine
// (§3.1). Every successful config change emits one event on the spine (audit consumer, BS §11.1).

using System.Text.Json;
using System.Text.RegularExpressions;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Rules;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Fields;

public enum FieldOperationOutcome
{
    Success,
    NotFound,
    Conflict,
    ValidationFailed,
    PlatformDefined,
    ForeignGlobal,
}

public sealed record FieldOperationResult(
    FieldOperationOutcome Outcome,
    FieldDefinitionDto? Field = null,
    IReadOnlyList<string>? Errors = null);

public interface IFieldSchemaService
{
    Task<WorkspaceFieldSchemaDto> GetSchemaAsync(Guid workspaceId, string objectType, CancellationToken cancellationToken);

    /// <summary>The keys of an object's required, non-retired fields — the light required-field presence
    /// check the custom-object records create/patch runs (Slice 1b). Works for any object type,
    /// including a custom object's slug.</summary>
    Task<IReadOnlyList<string>> GetRequiredFieldKeysAsync(
        Guid workspaceId, string objectType, CancellationToken cancellationToken);

    Task<WorkspaceFieldCatalogDto> GetCatalogAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<PlatformFieldCatalogDto> GetPlatformCatalogAsync(CancellationToken cancellationToken);

    Task<FieldOperationResult> UpsertFieldAsync(
        Guid workspaceId, FieldDefinitionUpsertRequest request, bool isCreate, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<FieldOperationResult> RetireFieldAsync(
        Guid workspaceId, string objectType, string fieldKey, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<IReadOnlyList<TaskLibraryFieldDto>> GetTaskLibraryAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<FieldOperationResult> UpsertTaskLibraryFieldAsync(
        Guid workspaceId, TaskLibraryFieldUpsertRequest request, bool isCreate, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    // ---- Global (platform-owned) custom-object field upsert/retire (SP3b Slice 2a) — platform-admin
    // surface, no workspace scope, no event emission (mirrors Slice 1's platform object CRUD). ----

    /// <summary>Creates or updates a field on a Global custom object (WorkspaceId NULL,
    /// Location='Global'). A platform admin owns Global fields, so the IsLocal/ForeignGlobal and
    /// IsPlatformDefined guards that gate a workspace's own field edits do not apply here.</summary>
    Task<FieldOperationResult> UpsertGlobalObjectFieldAsync(
        string objectKey, FieldDefinitionUpsertRequest request, bool isCreate, Guid actorUserId, CancellationToken cancellationToken);

    /// <summary>Retires a field on a Global custom object.</summary>
    Task<FieldOperationResult> RetireGlobalObjectFieldAsync(
        string objectKey, string fieldKey, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed partial class FieldSchemaService : IFieldSchemaService
{
    // Map the six task-library types (S30) onto the field-type catalog (§2.3).
    private static readonly IReadOnlyDictionary<string, string> TaskLibraryTypeToFieldType = new Dictionary<string, string>
    {
        ["Url"] = "Url",
        ["Text"] = "ShortText",
        ["Number"] = "Number",
        ["Date"] = "Date",
        ["Select"] = "SingleSelect",
        ["Checkbox"] = "Boolean",
    };

    private static readonly IReadOnlyDictionary<string, string> FieldTypeToTaskLibraryType =
        TaskLibraryTypeToFieldType.ToDictionary(pair => pair.Value, pair => pair.Key);

    private readonly AppDbContext _db;
    private readonly IConditionEngine _conditionEngine;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;
    private readonly IReadOnlyList<ImportExport.IIoObject> _ioObjects;
    private readonly IObjectSchemaService _objects;

    public FieldSchemaService(
        AppDbContext db, IConditionEngine conditionEngine, IEventSpine eventSpine, IClock clock,
        IEnumerable<ImportExport.IIoObject> ioObjects, IObjectSchemaService objects)
    {
        _db = db;
        _conditionEngine = conditionEngine;
        _eventSpine = eventSpine;
        _clock = clock;
        // Depend on the registered IIoObject descriptors directly (not IIoObjectRegistry) — the
        // registry itself resolves through ICustomObjectIoObjectFactory, which depends on this
        // service, so taking the registry here would create a DI cycle. Only the built-in
        // descriptors' catalog fields are needed, and IEnumerable<IIoObject> is exactly that set.
        _ioObjects = ioObjects.ToList();
        // ObjectSchemaService depends only on AppDbContext (not IFieldSchemaService), so this edge
        // is acyclic — verified by a container-resolution test (ImportExportEndpointsTests) that
        // resolves both interfaces from a real DI scope (the SP5 lesson: mocked unit tests and
        // 401-only integration tests can't see a cycle that only manifests at container build time).
        _objects = objects;
    }

    public async Task<WorkspaceFieldSchemaDto> GetSchemaAsync(Guid workspaceId, string objectType, CancellationToken cancellationToken)
    {
        var fields = await ReadFieldsAsync(workspaceId, objectType, cancellationToken).ConfigureAwait(false);
        var platform = await ReadPlatformBandAsync(cancellationToken).ConfigureAwait(false);
        return new WorkspaceFieldSchemaDto(workspaceId, objectType, fields, platform);
    }

    public async Task<IReadOnlyList<string>> GetRequiredFieldKeysAsync(
        Guid workspaceId, string objectType, CancellationToken cancellationToken)
    {
        var fields = await ReadFieldsAsync(workspaceId, objectType, cancellationToken).ConfigureAwait(false);
        return fields
            .Where(field => field.IsRequired && !field.IsRetired)
            .Select(field => field.FieldKey)
            .ToList();
    }

    public async Task<IReadOnlyList<TaskLibraryFieldDto>> GetTaskLibraryAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var fields = await ReadFieldsAsync(workspaceId, "Task", cancellationToken).ConfigureAwait(false);
        return fields
            .Where(field => !field.IsPlatformDefined)
            .Select(field => new TaskLibraryFieldDto(
                field.Id,
                field.FieldKey,
                field.DisplayName,
                FieldTypeToTaskLibraryType.TryGetValue(field.FieldType, out var libraryType) ? libraryType : field.FieldType,
                field.Options,
                field.SortOrder,
                field.IsRetired))
            .ToList();
    }

    public async Task<FieldOperationResult> UpsertFieldAsync(
        Guid workspaceId, FieldDefinitionUpsertRequest request, bool isCreate, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var objectType = request.ObjectType!;
        var fieldKey = request.FieldKey!;

        var existing = await ReadFieldsAsync(workspaceId, objectType, cancellationToken).ConfigureAwait(false);
        var current = existing.FirstOrDefault(field => field.FieldKey == fieldKey);

        if (isCreate && current is not null)
        {
            return new FieldOperationResult(FieldOperationOutcome.Conflict);
        }

        if (!isCreate && current is null)
        {
            return new FieldOperationResult(FieldOperationOutcome.NotFound);
        }

        // A Global field owned by another workspace is read-only here — editable only from its owner.
        if (current is not null && !current.IsLocal)
        {
            return new FieldOperationResult(FieldOperationOutcome.ForeignGlobal);
        }

        if (current is not null && current.IsPlatformDefined)
        {
            return new FieldOperationResult(FieldOperationOutcome.PlatformDefined);
        }

        var validationErrors = ValidateFieldTypeShape(request);
        var dependencies = ComputeDependencies(request);
        var graph = ValidateGraphWithChange(await ReadDependenciesAsync(workspaceId, objectType, cancellationToken).ConfigureAwait(false), fieldKey, dependencies);
        if (!graph.IsValid)
        {
            validationErrors = validationErrors.Concat(graph.Errors).ToList();
        }

        if (validationErrors.Count > 0)
        {
            return new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: validationErrors);
        }

        await ExecuteUpsertAsync(workspaceId, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);
        await EmitAsync(workspaceId, isCreate ? "field.created" : "field.updated", fieldKey, objectType, actorUserId, operationId, cancellationToken).ConfigureAwait(false);

        var refreshed = await ReadFieldsAsync(workspaceId, objectType, cancellationToken).ConfigureAwait(false);
        var saved = refreshed.First(field => field.FieldKey == fieldKey);
        return new FieldOperationResult(FieldOperationOutcome.Success, saved);
    }

    public async Task<FieldOperationResult> UpsertTaskLibraryFieldAsync(
        Guid workspaceId, TaskLibraryFieldUpsertRequest request, bool isCreate, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // A task-library field is a Task-object field with a narrowed type set; reuse the field upsert path.
        var fieldRequest = new FieldDefinitionUpsertRequest
        {
            ObjectType = "Task",
            FieldKey = request.FieldKey,
            DisplayName = request.DisplayName,
            FieldType = TaskLibraryTypeToFieldType[request.FieldType!],
            Category = "WorkspaceLocal",
            Section = "Task field library",
            Options = request.Options,
            SortOrder = request.SortOrder,
        };

        return await UpsertFieldAsync(workspaceId, fieldRequest, isCreate, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
    }

    public async Task<FieldOperationResult> RetireFieldAsync(
        Guid workspaceId, string objectType, string fieldKey, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var existing = await ReadFieldsAsync(workspaceId, objectType, cancellationToken).ConfigureAwait(false);
        var current = existing.FirstOrDefault(field => field.FieldKey == fieldKey);
        if (current is null)
        {
            return new FieldOperationResult(FieldOperationOutcome.NotFound);
        }

        if (!current.IsLocal)
        {
            return new FieldOperationResult(FieldOperationOutcome.ForeignGlobal);
        }

        if (current.IsPlatformDefined)
        {
            return new FieldOperationResult(FieldOperationOutcome.PlatformDefined);
        }

        // Dependency guard: another live field still references this one.
        var stillReferenced = existing
            .Where(field => field.FieldKey != fieldKey && !field.IsRetired)
            .SelectMany(FieldReferences)
            .Any(reference => string.Equals(reference, fieldKey, StringComparison.OrdinalIgnoreCase));
        if (stillReferenced)
        {
            return new FieldOperationResult(
                FieldOperationOutcome.ValidationFailed,
                Errors: new[] { $"'{current.DisplayName}' is used by another field's rule or derivation and cannot be retired until that reference is removed." });
        }

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RetireFieldDefinition @WorkspaceId, @ObjectType, @FieldKey, @ActorUserId",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", objectType),
                new SqlParameter("@FieldKey", fieldKey),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        await EmitAsync(workspaceId, "field.retired", fieldKey, objectType, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
        return new FieldOperationResult(FieldOperationOutcome.Success, current with { IsRetired = true });
    }

    public async Task<FieldOperationResult> UpsertGlobalObjectFieldAsync(
        string objectKey, FieldDefinitionUpsertRequest request, bool isCreate, Guid actorUserId, CancellationToken cancellationToken)
    {
        // The target must be a Global custom object (WorkspaceId NULL, Location='Global', not a built-in).
        var globals = await _objects.ListGlobalAsync(cancellationToken).ConfigureAwait(false);
        if (!globals.Any(o => o is { IsSystem: false, Location: "Global" } && o.ObjectKey == objectKey))
        {
            return new FieldOperationResult(FieldOperationOutcome.NotFound);
        }

        request.ObjectType = objectKey;
        request.Location = "Global";          // forced — platform fields are always Global
        var fieldKey = request.FieldKey!;

        // Read the object's Global fields (Guid.Empty owns no rows, so only Location='Global' rows surface).
        var existing = await ReadFieldsAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false);
        var current = existing.FirstOrDefault(field => field.FieldKey == fieldKey);
        if (isCreate && current is not null) return new FieldOperationResult(FieldOperationOutcome.Conflict);
        if (!isCreate && current is null) return new FieldOperationResult(FieldOperationOutcome.NotFound);
        // NOTE: no IsLocal/ForeignGlobal/IsPlatformDefined guard — platform admins own Global fields.

        var validationErrors = ValidateFieldTypeShape(request);
        var dependencies = ComputeDependencies(request);
        var graph = ValidateGraphWithChange(
            await ReadDependenciesAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false), fieldKey, dependencies);
        if (!graph.IsValid) validationErrors = validationErrors.Concat(graph.Errors).ToList();
        if (validationErrors.Count > 0)
            return new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: validationErrors);

        await ExecuteUpsertAsync(null, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);

        var refreshed = await ReadFieldsAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false);
        var saved = refreshed.First(field => field.FieldKey == fieldKey);
        return new FieldOperationResult(FieldOperationOutcome.Success, saved);
    }

    public async Task<FieldOperationResult> RetireGlobalObjectFieldAsync(
        string objectKey, string fieldKey, Guid actorUserId, CancellationToken cancellationToken)
    {
        // The target must be a Global custom object (mirrors UpsertGlobalObjectFieldAsync's guard).
        var globals = await _objects.ListGlobalAsync(cancellationToken).ConfigureAwait(false);
        if (!globals.Any(o => o is { IsSystem: false, Location: "Global" } && o.ObjectKey == objectKey))
        {
            return new FieldOperationResult(FieldOperationOutcome.NotFound);
        }

        var existing = await ReadFieldsAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false);
        var current = existing.FirstOrDefault(field => field.FieldKey == fieldKey);
        if (current is null)
        {
            return new FieldOperationResult(FieldOperationOutcome.NotFound);
        }

        // NOTE: no IsLocal/IsPlatformDefined guard — platform admins own Global fields.

        // Dependency guard: another live field still references this one.
        var stillReferenced = existing
            .Where(field => field.FieldKey != fieldKey && !field.IsRetired)
            .SelectMany(FieldReferences)
            .Any(reference => string.Equals(reference, fieldKey, StringComparison.OrdinalIgnoreCase));
        if (stillReferenced)
        {
            return new FieldOperationResult(
                FieldOperationOutcome.ValidationFailed,
                Errors: new[] { $"'{current.DisplayName}' is used by another field's rule or derivation and cannot be retired until that reference is removed." });
        }

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RetireFieldDefinition @WorkspaceId, @ObjectType, @FieldKey, @ActorUserId",
            new[]
            {
                new SqlParameter("@WorkspaceId", DBNull.Value),
                new SqlParameter("@ObjectType", objectKey),
                new SqlParameter("@FieldKey", fieldKey),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        // No event — platform ops are firm-wide, not per-workspace (mirrors Slice 1's platform object CRUD).
        return new FieldOperationResult(FieldOperationOutcome.Success, current with { IsRetired = true });
    }

    private async Task EmitAsync(
        Guid workspaceId, string eventType, string fieldKey, string objectType, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new { fieldKey, objectType });
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, RecordId: null, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    private GraphValidationResult ValidateGraphWithChange(
        IReadOnlyList<(string From, string To)> existingEdges, string fieldKey, IReadOnlyList<string> newDependencies)
    {
        var candidate = existingEdges
            .Where(edge => !string.Equals(edge.From, fieldKey, StringComparison.OrdinalIgnoreCase))
            .Concat(newDependencies.Select(to => (From: fieldKey, To: to)))
            .ToList();
        return _conditionEngine.ValidateGraph(candidate);
    }
}
