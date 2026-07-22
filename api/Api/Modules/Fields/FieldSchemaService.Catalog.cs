// FieldSchemaService — the flat Fields-tab catalog (Fields tab reconciliation). Composes one flat
// row per field across every object type: the five read-only system auto-fields synthesised per
// object, then the workspace's stored custom fields (local + Global, deduped in the proc). Split
// from the read/orchestration halves to keep each file focused.

using McDermott.AiTracker.Api.Data;
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

        return new WorkspaceFieldCatalogDto(workspaceId, BuildCatalogRows(stored));
    }

    /// <summary>Composes the flat catalog rows from the stored fields. Pure — no I/O — so it is
    /// unit-testable without a database (mirrors ObjectSchemaService.BuildSystemObjects).</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildCatalogRows(IReadOnlyList<FieldCatalogRow> stored)
    {
        var rows = new List<FieldCatalogRowDto>();

        // System auto-fields first — every object, in object then auto-field order.
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
                ObjectLabel: LabelForObject(row.ObjectType),
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

        return new PlatformFieldCatalogDto(BuildPlatformCatalogRows(globalStored, platformDefined));
    }

    /// <summary>Composes the platform Fields-tab catalog: the system auto-fields synthesised on each
    /// Global object, the platform-defined fields (minus the ones that duplicate the system rows) on
    /// the Request object, then every Global field across all workspaces (read-only here). Pure — no
    /// I/O — so it is unit-testable without a database. Deduped by (object, key).</summary>
    public static IReadOnlyList<FieldCatalogRowDto> BuildPlatformCatalogRows(
        IReadOnlyList<FieldCatalogRow> globalStored,
        IReadOnlyList<PlatformFieldRow> platformDefined)
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

        // 3. Global fields across every workspace — read-only on the platform screen.
        foreach (var row in globalStored)
        {
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

        return rows;
    }

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
