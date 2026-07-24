// Feature import/export descriptor (S28 tabs + wizards; dynamic export — field-surfacing sweep slice
// 3b). The registry entry for the Feature Catalog object: it declares the fields a CSV column can map
// to on import, derives the export columns from the hub's live Feature field catalog, projects each
// feature's FieldValues JSON map into an export row, and creates one Feature per import row. Features
// are AI-Solutions-hub-scoped (resolved server-side by FeaturesService), so export access is the
// caller's hub membership, not the passed workspace — a non-member gets a null dataset (→ 403, never a
// silent empty file). The export columns come from the SAME catalog the Fields tab reads (seeded in
// migration 076), so the export picker surfaces every Feature field and cannot drift from the catalog;
// values are read from Features.FieldValues (the single source of every content value, keyed by field
// key). Import fields stay the bounded scalar create-path set; array fields (tags, tech stack) are not
// CSV-mappable and are omitted. Row values are Confidential — written to the response, never logged
// (api-pii-handling.md).

using McDermott.AiTracker.Api.Modules.Features;
using McDermott.AiTracker.Api.Shared.Schema;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class FeatureIoObject : IIoObject, IIoImporter
{
    /// <summary>Page the hub Feature query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    // The identity export column — the RecordId, always emitted (BS §13 — every exported record is
    // identifiable). All other columns are the hub's stored Feature fields (derived at runtime).
    private static readonly IoFieldSpec IdField = new("id", "Record ID", AlwaysIncluded: true);

    // Import targets a CSV column may map to — the scalar fields the Feature create path accepts. Name
    // and Type are required at create (usp_CreateFeature has no defaults for them). Array fields
    // (capabilityTags / solutionPattern / techStack / complianceFlags) are not CSV-mappable, so they
    // are not offered on import.
    private static readonly IReadOnlyList<IoFieldSpec> ImportFieldSpecs =
    [
        new("name", "Name", Required: true),
        new("featureType", "Type", Required: true),
        new("oneLiner", "One-liner"),
        new("whatItDoes", "What it does"),
        new("howToReuse", "How to reuse"),
        new("demoUrl", "Demo URL"),
        new("repoUrl", "Repo URL"),
        new("owner", "Owner"),
        new("dataClassification", "Data Classification"),
    ];

    private readonly IFeaturesService _features;
    private readonly ImportExportOptions _options;

    public FeatureIoObject(IFeaturesService features, IOptions<ImportExportOptions> options)
    {
        _features = features;
        _options = options.Value;
    }

    public string ObjectType => "Feature";

    public string Label => "Features";

    public bool CanImport => true;

    public bool CanExport => true;

    public IReadOnlyList<IoFieldSpec> ImportFields => ImportFieldSpecs;

    // Feature's catalog comes from stored FieldDefinition rows on the hub (seeded in migration 076),
    // surfaced by FieldSchemaService on the Fields tab — nothing is synthesised here.
    public IReadOnlyList<CatalogFieldSpec> CatalogFields => Array.Empty<CatalogFieldSpec>();

    public async Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Columns follow the hub's live Feature field catalog — the same source as the Fields tab, so the
        // export picker cannot drift from it. Identity "id" (RecordId) leads; the catalog fields follow
        // in catalog order, deduped against the identity. (Feature is hub-scoped, so the passed workspace
        // is not used to resolve the catalog — FeaturesService resolves the hub.)
        var catalog = await _features.GetFeatureExportFieldsAsync(cancellationToken).ConfigureAwait(false);

        var fields = new List<IoFieldSpec>(catalog.Count + 1) { IdField };
        var seen = new HashSet<string>(StringComparer.Ordinal) { IdField.Key };
        foreach (var field in catalog)
        {
            if (seen.Add(field.Key))
            {
                fields.Add(new IoFieldSpec(field.Key, field.Label));
            }
        }

        return fields;
    }

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Columns from the hub catalog; values from each feature's FieldValues JSON. Features live in the
        // AI Solutions hub, not the passed workspace — access is the caller's hub membership, enforced
        // inside QueryFeatureExportAsync (null → the caller cannot see Features → 403).
        var columns = await GetExportFieldsAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);

        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var batch = await _features
                .QueryFeatureExportAsync(userId, page, ExportPageSize, cancellationToken)
                .ConfigureAwait(false);
            if (batch is null)
            {
                return null;
            }

            foreach (var row in batch)
            {
                rows.Add(FieldValuesProjector.Project(row.RecordId, row.FieldValues));
            }

            if (batch.Count < ExportPageSize)
            {
                break;
            }

            page++;
        }

        var trimmed = rows.Count > _options.MaxExportRows
            ? rows.Take(_options.MaxExportRows).ToList()
            : rows;

        return new ExportDataset(columns, trimmed);
    }

    public async Task<ImportRowResult> ImportRowAsync(
        ImportRowContext context, IReadOnlyDictionary<string, string?> fieldValues, CancellationToken cancellationToken)
    {
        var name = Value(fieldValues, "name");
        var featureType = Value(fieldValues, "featureType");

        // usp_CreateFeature has no server-side defaults for Name/Type, so guard them here (the wizard's
        // mapping validation requires the columns be mapped, but an individual cell can still be blank).
        var missing = new List<ImportReasonDto>();
        if (string.IsNullOrWhiteSpace(name))
        {
            missing.Add(new ImportReasonDto("missing-required", "A value for \"Name\" is required.", "name"));
        }

        if (string.IsNullOrWhiteSpace(featureType))
        {
            missing.Add(new ImportReasonDto("missing-required", "A value for \"Type\" is required.", "featureType"));
        }

        if (missing.Count > 0)
        {
            return new ImportRowResult(ImportRowResult.Flagged, null, missing);
        }

        var request = new FeatureCreateRequest
        {
            Name = name,
            FeatureType = featureType,
            OneLiner = Value(fieldValues, "oneLiner"),
            WhatItDoes = Value(fieldValues, "whatItDoes"),
            HowToReuse = Value(fieldValues, "howToReuse"),
            DemoUrl = Value(fieldValues, "demoUrl"),
            RepoUrl = Value(fieldValues, "repoUrl"),
            Owner = Value(fieldValues, "owner"),
            DataClassification = Value(fieldValues, "dataClassification"),
        };

        var result = await _features
            .CreateAsync(request, context.ActorUserId, context.OperationId, cancellationToken)
            .ConfigureAwait(false);

        return result.Outcome switch
        {
            FeatureWriteOutcome.Success =>
                new ImportRowResult(ImportRowResult.Landed, result.Feature!.Id, Array.Empty<ImportReasonDto>()),
            _ => new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.GenericFailure()),
        };
    }

    private static string? Value(IReadOnlyDictionary<string, string?> fieldValues, string key) =>
        fieldValues.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
}
