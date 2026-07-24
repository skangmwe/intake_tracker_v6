// Derivations shared by every fixed-column export descriptor (field-surfacing sweep, Approach B).
// A descriptor declares its fields ONCE as an ObjectFieldSpec<TRow> manifest; these helpers project
// that single list into the export field specs, the catalog field specs, and a row's value map — so
// the Fields catalog and the Import/Export picker can never disagree about what fields an object has.

using McDermott.AiTracker.Api.Shared.Schema;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

internal static class ManifestSupport
{
    /// <summary>Export field specs (identity → AlwaysIncluded) from a manifest.</summary>
    public static IReadOnlyList<IoFieldSpec> ExportFieldsFrom<TRow>(IReadOnlyList<ObjectFieldSpec<TRow>> manifest) =>
        manifest.Select(field => new IoFieldSpec(field.Key, field.Label, AlwaysIncluded: field.IsIdentity)).ToList();

    /// <summary>Catalog field specs (no value reader) from a manifest.</summary>
    public static IReadOnlyList<CatalogFieldSpec> CatalogFieldsFrom<TRow>(
        string objectType, IReadOnlyList<ObjectFieldSpec<TRow>> manifest) =>
        manifest.Select(field => new CatalogFieldSpec(objectType, field.Key, field.Label, field.FieldType)).ToList();

    /// <summary>Project one row into a value map keyed by field key, using each field's reader.</summary>
    public static IReadOnlyDictionary<string, object?> Project<TRow>(
        IReadOnlyList<ObjectFieldSpec<TRow>> manifest, TRow row) =>
        manifest.ToDictionary(field => field.Key, field => field.Read(row), StringComparer.Ordinal);
}
