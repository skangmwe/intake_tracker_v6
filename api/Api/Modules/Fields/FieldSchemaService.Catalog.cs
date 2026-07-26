// FieldSchemaService — the flat Fields-tab catalog (Fields tab reconciliation). Composes one flat
// row per field across every object type: the five read-only system auto-fields synthesised per
// object, then the workspace's stored custom fields (local + Global, deduped in the proc). Split
// from the read/orchestration halves to keep each file focused.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.Schema;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Fields;

public sealed partial class FieldSchemaService
{
    // The five built-in objects, in display order: (machine key, display label). Only ToolkitItem's
    // label differs from its key. Attachment/Toolkit item carry no custom field schema today — they
    // still get the synthesised system rows.
    private static readonly (string Key, string Label)[] CatalogObjects =
    [
        ("Request", "Request"),
        ("Task", "Task"),
        ("Attachment", "Attachment"),
        ("Feature", "Feature"),
        ("ToolkitItem", "Toolkit item"),
    ];

    // The five system auto-fields provisioned on every object (Record ID / Name / Date created /
    // Last updated / Created by). Synthesised read-only rows — never stored, never editable. Any
    // stored field whose key collides with one of these is folded into the single System row.
    private static readonly (string Key, string Label, string Type)[] SystemAutoFields =
    [
        ("recordId", "Record ID", "ShortText"),
        ("name", "Name", "ShortText"),
        ("createdAt", "Date created", "Date"),
        ("updatedAt", "Last updated", "Date"),
        ("createdBy", "Created by", "ShortText"),
    ];

    private static readonly HashSet<string> SystemAutoFieldKeys =
        new(SystemAutoFields.Select(field => field.Key), StringComparer.OrdinalIgnoreCase);

    // The Global objects for the platform catalog (S34) — the two objects with Location = 'Global'.
    private static readonly (string Key, string Label)[] PlatformCatalogObjects =
    [
        ("Request", "Request"),
        ("Task", "Task"),
    ];

    // dbo.PlatformField carries its own type vocabulary; map it onto the field-type catalog (§2.3) so
    // platform-defined rows render with the same TYPE labels as everything else.
    private static readonly IReadOnlyDictionary<string, string> PlatformFieldTypeToFieldType =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Text"] = "ShortText",
            ["DateTime"] = "DateTime",
            ["Select"] = "SingleSelect",
            ["Lookup"] = "ShortText",
        };

    public async Task<WorkspaceFieldCatalogDto> GetCatalogAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var stored = await _db.Set<FieldCatalogRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // The registered object descriptors are the single source of each fixed-column object's built-in
        // fields (Attachment, Toolkit item, …); surface the same fields they export.
        var builtIn = _ioObjects.SelectMany(io => io.CatalogFields).ToList();

        // The workspace's custom objects — each is "just another object type" keyed by its slug. They
        // get the same synthesised system auto-fields, and their stored fields carry ObjectType = slug.
        var customObjectRows = await _db.Set<ObjectDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_ListObjectDefinitions @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var customObjects = customObjectRows
            .Select(row => (ObjectType: row.ObjectKey, Label: row.Name))
            .ToList();

        return new WorkspaceFieldCatalogDto(workspaceId, BuildCatalogRows(stored, builtIn, customObjects));
    }

    /// <summary>Composes the flat catalog rows from the stored fields. Pure — no I/O — so it is
    /// unit-testable without a database (mirrors ObjectSchemaService.BuildSystemObjects).</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildCatalogRows(IReadOnlyList<FieldCatalogRow> stored) =>
        BuildCatalogRows(stored, Array.Empty<CatalogFieldSpec>());

    /// <summary>Composes the flat catalog rows from the stored fields plus each object's built-in fields
    /// (fixed-column objects whose fields are code-defined, not stored FieldDefinition rows). Pure — no
    /// I/O. Built-in rows are read-only and deduped against the system auto-fields and stored rows.</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildCatalogRows(
        IReadOnlyList<FieldCatalogRow> stored, IReadOnlyList<CatalogFieldSpec> builtIn) =>
        BuildCatalogRows(stored, builtIn, Array.Empty<(string ObjectType, string Label)>());

    /// <summary>As above, plus the workspace's custom objects: each gets the same five synthesised
    /// read-only system auto-fields, and its stored custom fields (ObjectType = slug) flow through the
    /// stored loop with the object's Name as the OBJECT label. Pure — no I/O.</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildCatalogRows(
        IReadOnlyList<FieldCatalogRow> stored,
        IReadOnlyList<CatalogFieldSpec> builtIn,
        IReadOnlyList<(string ObjectType, string Label)> customObjects)
    {
        var rows = new List<FieldCatalogRowDto>();
        var customLabels = customObjects.ToDictionary(
            entry => entry.ObjectType, entry => entry.Label, StringComparer.OrdinalIgnoreCase);
        var storedKeys = stored
            .Select(row => (row.ObjectType, Key: row.FieldKey.ToLowerInvariant()))
            .ToHashSet();
        var builtInByObject = builtIn
            .GroupBy(field => field.ObjectType, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.Ordinal);

        // System auto-fields first — every object, in object then auto-field order — then that object's
        // built-in fields (fixed-column objects only; empty for objects backed by stored definitions).
        foreach (var (objectKey, objectLabel) in CatalogObjects)
        {
            foreach (var (fieldKey, fieldLabel, fieldType) in SystemAutoFields)
            {
                rows.Add(new FieldCatalogRowDto(
                    Id: $"system:{objectKey}:{fieldKey}",
                    ObjectType: objectKey,
                    ObjectLabel: objectLabel,
                    FieldKey: fieldKey,
                    DisplayName: fieldLabel,
                    FieldType: fieldType,
                    Location: "Global",
                    IsRequired: true,
                    Source: "System",
                    Status: "Active",
                    IsReadOnly: true));
            }

            if (!builtInByObject.TryGetValue(objectKey, out var builtInFields))
            {
                continue;
            }

            var addedForObject = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var field in builtInFields)
            {
                if (SystemAutoFieldKeys.Contains(field.Key))
                {
                    continue; // already a system auto-field row
                }

                if (storedKeys.Contains((objectKey, field.Key.ToLowerInvariant())))
                {
                    continue; // an admin-created custom field of the same key wins
                }

                if (!addedForObject.Add(field.Key))
                {
                    continue; // built-in dedup
                }

                rows.Add(new FieldCatalogRowDto(
                    Id: $"builtin:{objectKey}:{field.Key}",
                    ObjectType: objectKey,
                    ObjectLabel: objectLabel,
                    FieldKey: field.Key,
                    DisplayName: field.Label,
                    FieldType: field.FieldType,
                    Location: "Global",
                    IsRequired: false,
                    Source: "System",
                    Status: "Active",
                    IsReadOnly: true));
            }
        }

        // Custom objects: synthesise the same five read-only system auto-fields per object. Their
        // stored custom fields (if any) flow through the stored loop below (ObjectType = slug).
        foreach (var (objectType, objectLabel) in customObjects)
        {
            foreach (var (fieldKey, fieldLabel, fieldType) in SystemAutoFields)
            {
                rows.Add(new FieldCatalogRowDto(
                    Id: $"system:{objectType}:{fieldKey}",
                    ObjectType: objectType,
                    ObjectLabel: objectLabel,
                    FieldKey: fieldKey,
                    DisplayName: fieldLabel,
                    FieldType: fieldType,
                    Location: "LocalWorkspace",
                    IsRequired: true,
                    Source: "System",
                    Status: "Active",
                    IsReadOnly: true));
            }
        }

        // Then stored custom fields, excluding any key represented by a synthesised system row.
        foreach (var row in stored)
        {
            if (SystemAutoFieldKeys.Contains(row.FieldKey))
            {
                continue;
            }

            var isSystem = row.IsPlatformDefined || row.IsSystemProvisioned;
            rows.Add(new FieldCatalogRowDto(
                Id: row.FieldDefinitionId.ToString(),
                ObjectType: row.ObjectType,
                ObjectLabel: LabelForObject(row.ObjectType, customLabels),
                FieldKey: row.FieldKey,
                DisplayName: row.DisplayName,
                FieldType: row.FieldType,
                Location: row.Location,
                IsRequired: row.IsRequired,
                Source: isSystem ? "System" : "User",
                Status: row.IsRetired ? "Archived" : "Active",
                // Read-only when derived/platform/system, or when it's a foreign Global field
                // surfaced here (editable only from its owning workspace).
                IsReadOnly: row.IsReadOnly || row.IsPlatformDefined || isSystem || !row.IsLocal));
        }

        return rows;
    }

    public async Task<PlatformFieldCatalogDto> GetPlatformCatalogAsync(CancellationToken cancellationToken)
    {
        var globalStored = await _db.Set<FieldCatalogRow>()
            .FromSqlRaw("EXEC dbo.usp_GetPlatformFieldCatalog")
            .AsNoTracking()
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var platformDefined = await _db.Set<PlatformFieldRow>()
            .FromSqlRaw("EXEC dbo.usp_GetPlatformFields")
            .AsNoTracking()
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // Global custom objects (SP3b Slice 2a) — each contributes its own system auto-fields plus
        // its platform-owned Global fields, editable here. Read per object via the same field-read
        // path UpsertGlobalObjectFieldAsync uses (Guid.Empty owns no rows, so only that object's
        // Location='Global' rows surface — see FieldSchemaService.cs).
        var globalObjects = await _objects.ListGlobalAsync(cancellationToken).ConfigureAwait(false);
        var globalCustomObjects = new List<(string ObjectKey, string ObjectLabel, IReadOnlyList<FieldDefinitionDto> Fields)>();
        foreach (var globalObject in globalObjects.Where(o => !o.IsSystem))
        {
            var fields = await ReadFieldsAsync(Guid.Empty, globalObject.ObjectKey, cancellationToken).ConfigureAwait(false);
            globalCustomObjects.Add((globalObject.ObjectKey, globalObject.Name, fields));
        }

        return new PlatformFieldCatalogDto(BuildPlatformCatalogRows(globalStored, platformDefined, globalCustomObjects));
    }

    /// <summary>Composes the platform Fields-tab catalog: the system auto-fields synthesised on each
    /// Global object, the platform-defined fields (minus the ones that duplicate the system rows) on
    /// the Request object, then every Global field across all workspaces (read-only here). Pure — no
    /// I/O — so it is unit-testable without a database. Deduped by (object, key).</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildPlatformCatalogRows(
        IReadOnlyList<FieldCatalogRow> globalStored,
        IReadOnlyList<PlatformFieldRow> platformDefined) =>
        BuildPlatformCatalogRows(
            globalStored, platformDefined,
            Array.Empty<(string ObjectKey, string ObjectLabel, IReadOnlyList<FieldDefinitionDto> Fields)>());

    /// <summary>As above, plus each Global custom object (SP3b Slice 2a): its five synthesised
    /// read-only system auto-fields, then its platform-owned Global fields as EDITABLE rows (a
    /// platform admin owns Global fields directly — mirrors UpsertGlobalObjectFieldAsync having no
    /// IsLocal/ForeignGlobal guard). A Global custom object's fields also appear in
    /// <paramref name="globalStored"/> (usp_GetPlatformFieldCatalog scopes on Location='Global' only,
    /// with no ObjectType restriction) but with WorkspaceId NULL — those rows are skipped in step 3
    /// below so each field renders exactly once, as editable. Pure — no I/O.</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildPlatformCatalogRows(
        IReadOnlyList<FieldCatalogRow> globalStored,
        IReadOnlyList<PlatformFieldRow> platformDefined,
        IReadOnlyList<(string ObjectKey, string ObjectLabel, IReadOnlyList<FieldDefinitionDto> Fields)> globalCustomObjects)
    {
        var rows = new List<FieldCatalogRowDto>();
        var seen = new HashSet<(string ObjectType, string FieldKey)>();

        bool Reserve(string objectType, string fieldKey) =>
            seen.Add((objectType, fieldKey.ToLowerInvariant()));

        // 1. System auto-fields on every Global object.
        foreach (var (objectKey, objectLabel) in PlatformCatalogObjects)
        {
            foreach (var (fieldKey, fieldLabel, fieldType) in SystemAutoFields)
            {
                Reserve(objectKey, fieldKey);
                rows.Add(new FieldCatalogRowDto(
                    Id: $"system:{objectKey}:{fieldKey}",
                    ObjectType: objectKey,
                    ObjectLabel: objectLabel,
                    FieldKey: fieldKey,
                    DisplayName: fieldLabel,
                    FieldType: fieldType,
                    Location: "Global",
                    IsRequired: true,
                    Source: "System",
                    Status: "Active",
                    IsReadOnly: true));
            }
        }

        // 2. Platform-defined fields on the Request object — excluding the System-category entries
        //    (record-id / workspace / created-at / updated-at) that already render as system rows.
        foreach (var platform in platformDefined)
        {
            if (string.Equals(platform.Category, "System", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!Reserve("Request", platform.FieldKey))
            {
                continue;
            }

            rows.Add(new FieldCatalogRowDto(
                Id: $"platform:{platform.FieldKey}",
                ObjectType: "Request",
                ObjectLabel: "Request",
                FieldKey: platform.FieldKey,
                DisplayName: platform.DisplayName,
                FieldType: PlatformFieldTypeToFieldType.TryGetValue(platform.FieldType, out var mapped) ? mapped : "ShortText",
                Location: "Global",
                IsRequired: false,
                Source: "Platform",
                Status: "Active",
                // Editable by a Platform admin unless the central definition is immutable.
                IsReadOnly: platform.IsSystemImmutable));
        }

        // 3. Global fields across every workspace — read-only on the platform screen. A platform-owned
        //    Global custom object's fields (WorkspaceId NULL) also satisfy this proc's WHERE clause
        //    (Location='Global', no ObjectType restriction) — skip them here; step 4 below adds them
        //    as editable, grouped under their object, so each field renders exactly once.
        foreach (var row in globalStored)
        {
            if (row.WorkspaceId is null)
            {
                continue;
            }

            if (SystemAutoFieldKeys.Contains(row.FieldKey))
            {
                continue;
            }

            if (!Reserve(row.ObjectType, row.FieldKey))
            {
                continue;
            }

            rows.Add(new FieldCatalogRowDto(
                Id: row.FieldDefinitionId.ToString(),
                ObjectType: row.ObjectType,
                ObjectLabel: LabelForObject(row.ObjectType),
                FieldKey: row.FieldKey,
                DisplayName: row.DisplayName,
                FieldType: row.FieldType,
                Location: "Global",
                IsRequired: row.IsRequired,
                Source: "User",
                Status: row.IsRetired ? "Archived" : "Active",
                IsReadOnly: true));
        }

        // 4. Global custom objects (SP3b Slice 2a): the same five read-only system auto-fields as a
        //    built-in Global object, then that object's platform-owned Global fields — editable here,
        //    since a platform admin owns them directly (no owning workspace to defer to).
        foreach (var (objectKey, objectLabel, fields) in globalCustomObjects)
        {
            foreach (var (fieldKey, fieldLabel, fieldType) in SystemAutoFields)
            {
                Reserve(objectKey, fieldKey);
                rows.Add(new FieldCatalogRowDto(
                    Id: $"system:{objectKey}:{fieldKey}",
                    ObjectType: objectKey,
                    ObjectLabel: objectLabel,
                    FieldKey: fieldKey,
                    DisplayName: fieldLabel,
                    FieldType: fieldType,
                    Location: "Global",
                    IsRequired: true,
                    Source: "System",
                    Status: "Active",
                    IsReadOnly: true));
            }

            foreach (var field in fields)
            {
                // Defensive — ReadFieldsAsync(Guid.Empty, objectKey, ct) already scopes to Location='Global'
                // rows (Guid.Empty owns no rows), but guard explicitly so the composition never drifts.
                if (!string.Equals(field.Location, "Global", StringComparison.Ordinal))
                {
                    continue;
                }

                if (SystemAutoFieldKeys.Contains(field.FieldKey))
                {
                    continue;
                }

                if (!Reserve(objectKey, field.FieldKey))
                {
                    continue;
                }

                var isSystem = field.IsPlatformDefined || field.IsSystemProvisioned;
                rows.Add(new FieldCatalogRowDto(
                    Id: field.Id.ToString(),
                    ObjectType: objectKey,
                    ObjectLabel: objectLabel,
                    FieldKey: field.FieldKey,
                    DisplayName: field.DisplayName,
                    FieldType: field.FieldType,
                    Location: "Global",
                    IsRequired: field.IsRequired,
                    Source: isSystem ? "System" : "User",
                    Status: field.IsRetired ? "Archived" : "Active",
                    IsReadOnly: false));
            }
        }

        return rows;
    }

    // Overload used by the workspace catalog: a custom object's slug resolves to its Name; anything
    // else falls back to the built-in label (or the raw key).
    private static string LabelForObject(string objectType, IReadOnlyDictionary<string, string> customLabels) =>
        customLabels.TryGetValue(objectType, out var custom) ? custom : LabelForObject(objectType);

    private static string LabelForObject(string objectType)
    {
        foreach (var (key, label) in CatalogObjects)
        {
            if (string.Equals(key, objectType, StringComparison.Ordinal))
            {
                return label;
            }
        }

        return objectType;
    }
}
