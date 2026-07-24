// Single-source field manifest primitives (field-surfacing sweep, Approach B). A fixed-column
// object (Task, Attachment, Toolkit item, …) declares its fields ONCE as a list of
// ObjectFieldSpec<TRow>; both the Fields & objects catalog and the Import/Export field picker
// derive from that one list, so the two surfaces cannot drift ("if a field exists, it's surfaced
// everywhere"). Neutral namespace so neither the Fields module nor the ImportExport module has to
// depend on the other for these types.

namespace McDermott.AiTracker.Api.Shared.Schema;

/// <summary>One field of a fixed-column object, declared once. <paramref name="Read"/> projects the
/// field's value from an export row; <paramref name="IsIdentity"/> marks the always-included export
/// identity column. The same Key/Label/FieldType feed the Fields catalog.</summary>
public sealed record ObjectFieldSpec<TRow>(
    string Key,
    string Label,
    string FieldType,
    Func<TRow, object?> Read,
    bool IsIdentity = false);

/// <summary>The catalog-facing view of a field (no value reader) — what the Fields and objects tab
/// needs to render a built-in field row for an object.</summary>
public sealed record CatalogFieldSpec(
    string ObjectType,
    string Key,
    string Label,
    string FieldType);
