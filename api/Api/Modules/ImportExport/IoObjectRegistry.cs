// Import/Export object registry (S28 tabs + wizards). The single extension point for object-aware
// import and export: each importable/exportable object type registers one IIoObject describing the
// fields it exposes on each side and how to project its rows to CSV. Slice 1 registers Request only;
// later slices add Feature, Task, Toolkit, and Attachment descriptors here — new descriptors, not new
// endpoints. The registry is a thin lookup over the registered descriptors (DI-composed).

using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.Schema;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

/// <summary>One field an object exposes to import (a CSV column may map to it) or export (it can be
/// emitted as a column). <c>Required</c> marks an import field that must be mapped; <c>AlwaysIncluded</c>
/// marks an export field that is always in the file (the identity column) and cannot be dropped.</summary>
public sealed record IoFieldSpec(string Key, string Label, bool Required = false, bool AlwaysIncluded = false);

/// <summary>The full projected result of an object export: every exportable column plus one row per
/// already-access-filtered record (values keyed by field key). ExportService selects the caller's
/// chosen column subset from this.</summary>
public sealed record ExportDataset(
    IReadOnlyList<IoFieldSpec> Columns,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows);

/// <summary>Whether an import run creates new records only, or matches by Record ID and updates
/// existing ones (create-or-update). Only objects with <see cref="IIoObject.CanUpsert"/> accept Upsert.</summary>
public enum ImportMode { Create, Upsert }

/// <summary>What an imported row did to the store — used for the created/updated report split. A
/// Flagged row is None.</summary>
public enum ImportAction { None, Created, Updated }

/// <summary>Per-object import/export capability descriptor. One registered instance per object type.</summary>
public interface IIoObject
{
    /// <summary>Machine key — matches the object type union ("Request", "Task", …).</summary>
    string ObjectType { get; }

    /// <summary>Plural display label ("Requests").</summary>
    string Label { get; }

    bool CanImport { get; }

    bool CanExport { get; }

    /// <summary>Whether this object supports upsert import (match an existing record by Record ID and
    /// update it). False for the built-ins (create-only); true for custom objects.</summary>
    bool CanUpsert { get; }

    /// <summary>Fields a CSV column may be mapped to on import (empty when <see cref="CanImport"/> is false).</summary>
    IReadOnlyList<IoFieldSpec> ImportFields { get; }

    /// <summary>Columns that can be emitted on export, for the given workspace and caller (empty when
    /// <see cref="CanExport"/> is false). Workspace-aware because an object's field set can be
    /// per-workspace: fixed-column objects return a static list, while objects whose fields are stored
    /// <c>FieldDefinition</c> rows (Request/Feature) derive their columns from the workspace's live field
    /// catalog — so the export picker and the Fields catalog cannot drift. <paramref name="userId"/> lets
    /// a hub-scoped object gate its field catalog on the caller's membership.</summary>
    Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken);

    /// <summary>The object's built-in fields to surface in the Fields &amp; objects catalog — the single
    /// source, shared with <see cref="GetExportFieldsAsync"/> for fixed-column objects. Empty for objects whose
    /// catalog comes from stored <c>FieldDefinition</c> rows (Request/Feature/Task), so the catalog is
    /// not double-populated. <c>FieldSchemaService</c> reads this off the registry to synthesize
    /// read-only built-in rows for objects that have no stored field definitions.</summary>
    IReadOnlyList<CatalogFieldSpec> CatalogFields { get; }

    /// <summary>Project the object's already-access-filtered rows into an export dataset. The caller
    /// (ExportService) has already gated workspace access, but an object may enforce its own access
    /// boundary (e.g. a firm-hub object scoped by the caller's membership rather than the passed
    /// workspace) — return <c>null</c> when the caller is not entitled to the object at all, which the
    /// caller maps to a 403 (never a silent empty file). <paramref name="userId"/> is the caller, so a
    /// descriptor whose query is user-filtered (not workspace-filtered) can gate on it.</summary>
    Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken);
}

/// <summary>Per-job context for an object-aware CSV import. <c>ActorEmail</c> is the importing user's
/// directory email, resolved once per job by the runner so a descriptor's requestor fallback does not
/// re-query it per row (api-performance.md — no queries in a loop).</summary>
public sealed record ImportRowContext(
    Guid WorkspaceId, Guid ActorUserId, string ActorEmail, string OperationId,
    ImportMode Mode = ImportMode.Create);

/// <summary>The outcome of importing one CSV row through a descriptor. <c>Outcome</c> is
/// <see cref="Landed"/> (a record was created or updated) or <see cref="Flagged"/> (nothing created, or created
/// with a caveat). A landed row may still carry <c>Reasons</c> — e.g. a requestor-fallback warning —
/// which the runner tallies as flagged for the report (BS §13, never silent).</summary>
public sealed record ImportRowResult(
    string Outcome, string? RecordId, IReadOnlyList<ImportReasonDto> Reasons,
    ImportAction Action = ImportAction.None)
{
    public const string Landed = "Landed";
    public const string Flagged = "Flagged";
}

/// <summary>Import capability for a registered object. Only descriptors that can create a record from a
/// CSV row implement this (export-only objects — Toolkit, Attachment — do not). The registry is the
/// single extension point: the runner resolves the object by type, casts to this, and dispatches the
/// row — later slices add descriptors, not runner branches.</summary>
public interface IIoImporter
{
    /// <summary>Create one record from a row's mapped values (keyed by the object's import field keys,
    /// already column-mapped and trimmed). Blank/absent required values are the descriptor's own
    /// concern — it returns a Flagged result rather than throwing for expected validation failures.</summary>
    Task<ImportRowResult> ImportRowAsync(
        ImportRowContext context, IReadOnlyDictionary<string, string?> fieldValues, CancellationToken cancellationToken);
}

public interface IIoObjectRegistry
{
    /// <summary>All registered object descriptors, in registration order.</summary>
    IReadOnlyList<IIoObject> All { get; }

    /// <summary>The descriptor for an object type, or null when the type is not registered.</summary>
    IIoObject? Find(string? objectType);

    /// <summary>All descriptors available in a workspace: the static built-ins plus one descriptor per
    /// non-system custom object (dbo.ObjectDefinition). Workspace-aware because custom objects are
    /// per-workspace. Used by the import/export wizards and export/import services; the static <see cref="All"/>
    /// stays built-ins-only for the Fields catalog.</summary>
    Task<IReadOnlyList<IIoObject>> AllForWorkspaceAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken);

    /// <summary>The descriptor for an object type in a workspace: a static built-in, or a custom object
    /// resolved by slug. Null when the type is neither.</summary>
    Task<IIoObject?> FindForWorkspaceAsync(Guid workspaceId, string? objectType, Guid userId, CancellationToken cancellationToken);
}

public sealed class IoObjectRegistry : IIoObjectRegistry
{
    private readonly IReadOnlyList<IIoObject> _objects;
    private readonly IReadOnlyDictionary<string, IIoObject> _byType;
    private readonly IObjectSchemaService _objectSchema;
    private readonly ICustomObjectIoObjectFactory _factory;

    public IoObjectRegistry(
        IEnumerable<IIoObject> objects,
        IObjectSchemaService objectSchema,
        ICustomObjectIoObjectFactory factory)
    {
        _objects = objects.ToList();
        _byType = _objects.ToDictionary(item => item.ObjectType, StringComparer.Ordinal);
        _objectSchema = objectSchema;
        _factory = factory;
    }

    public IReadOnlyList<IIoObject> All => _objects;

    public IIoObject? Find(string? objectType) =>
        objectType is not null && _byType.TryGetValue(objectType, out var match) ? match : null;

    public async Task<IReadOnlyList<IIoObject>> AllForWorkspaceAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        var result = new List<IIoObject>(_objects);
        var definitions = await _objectSchema.ListAsync(workspaceId, cancellationToken).ConfigureAwait(false);
        foreach (var definition in definitions.Where(item => !item.IsSystem))
        {
            result.Add(await _factory.CreateAsync(workspaceId, definition, userId, cancellationToken).ConfigureAwait(false));
        }

        return result;
    }

    public async Task<IIoObject?> FindForWorkspaceAsync(
        Guid workspaceId, string? objectType, Guid userId, CancellationToken cancellationToken)
    {
        // Built-ins first (Request/Feature/Task/Toolkit/Attachment) — no schema read needed.
        if (Find(objectType) is { } builtIn)
        {
            return builtIn;
        }

        if (string.IsNullOrWhiteSpace(objectType))
        {
            return null;
        }

        var definitions = await _objectSchema.ListAsync(workspaceId, cancellationToken).ConfigureAwait(false);
        var match = definitions.FirstOrDefault(item =>
            !item.IsSystem && string.Equals(item.ObjectKey, objectType, StringComparison.Ordinal));
        return match is null ? null : await _factory.CreateAsync(workspaceId, match, userId, cancellationToken).ConfigureAwait(false);
    }
}
