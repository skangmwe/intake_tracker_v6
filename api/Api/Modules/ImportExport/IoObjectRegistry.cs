// Import/Export object registry (S28 tabs + wizards). The single extension point for object-aware
// import and export: each importable/exportable object type registers one IIoObject describing the
// fields it exposes on each side and how to project its rows to CSV. Slice 1 registers Request only;
// later slices add Feature, Task, Toolkit, and Attachment descriptors here — new descriptors, not new
// endpoints. The registry is a thin lookup over the registered descriptors (DI-composed).

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

/// <summary>Per-object import/export capability descriptor. One registered instance per object type.</summary>
public interface IIoObject
{
    /// <summary>Machine key — matches the object type union ("Request", "Task", …).</summary>
    string ObjectType { get; }

    /// <summary>Plural display label ("Requests").</summary>
    string Label { get; }

    bool CanImport { get; }

    bool CanExport { get; }

    /// <summary>Fields a CSV column may be mapped to on import (empty when <see cref="CanImport"/> is false).</summary>
    IReadOnlyList<IoFieldSpec> ImportFields { get; }

    /// <summary>Columns that can be emitted on export (empty when <see cref="CanExport"/> is false).</summary>
    IReadOnlyList<IoFieldSpec> ExportFields { get; }

    /// <summary>Project the object's already-access-filtered rows into an export dataset. The caller
    /// (ExportService) has already gated workspace access; the descriptor only reads.</summary>
    Task<ExportDataset> BuildExportAsync(Guid workspaceId, CancellationToken cancellationToken);
}

public interface IIoObjectRegistry
{
    /// <summary>All registered object descriptors, in registration order.</summary>
    IReadOnlyList<IIoObject> All { get; }

    /// <summary>The descriptor for an object type, or null when the type is not registered.</summary>
    IIoObject? Find(string? objectType);
}

public sealed class IoObjectRegistry : IIoObjectRegistry
{
    private readonly IReadOnlyList<IIoObject> _objects;
    private readonly IReadOnlyDictionary<string, IIoObject> _byType;

    public IoObjectRegistry(IEnumerable<IIoObject> objects)
    {
        _objects = objects.ToList();
        _byType = _objects.ToDictionary(item => item.ObjectType, StringComparer.Ordinal);
    }

    public IReadOnlyList<IIoObject> All => _objects;

    public IIoObject? Find(string? objectType) =>
        objectType is not null && _byType.TryGetValue(objectType, out var match) ? match : null;
}
