// Feature import/export descriptor (S28 tabs + wizards, Slice 2). The registry entry for the Feature
// Catalog object: it declares the fields a CSV column can map to on import and the columns emitted on
// export, projects the access-filtered Feature Catalog query into an export dataset, and creates one
// Feature per import row. Features are AI-Solutions-hub-scoped (resolved server-side by FeaturesService),
// so export access is the caller's hub membership, not the passed workspace — a non-member gets a null
// dataset (→ 403, never a silent empty file). Import fields are the scalar create-path fields; array
// fields (tags, tech stack) are not CSV-mappable and are omitted. Row values are Confidential — written
// to the response, never logged (api-pii-handling.md).

using McDermott.AiTracker.Api.Modules.Features;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class FeatureIoObject : IIoObject, IIoImporter
{
    /// <summary>Page the access-gated Feature query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    /// <summary>Multi-value fields (tags, tech stack) join with this separator in a single CSV cell.</summary>
    private const string MultiValueSeparator = "; ";

    // Export columns == the columns FeaturesService.QueryAsync returns, in file order. "id" is the
    // identity column and is always emitted (BS §13 — every exported record is identifiable).
    private static readonly IReadOnlyList<IoFieldSpec> ExportFieldSpecs =
    [
        new("id", "Record ID", AlwaysIncluded: true),
        new("name", "Name"),
        new("oneLiner", "One-liner"),
        new("featureType", "Type"),
        new("capabilityTags", "Capability Tags"),
        new("techStack", "Tech Stack"),
        new("owner", "Owner"),
        new("maturity", "Maturity"),
        new("origin", "Origin"),
        new("updated", "Last Updated"),
    ];

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

    public IReadOnlyList<IoFieldSpec> ExportFields => ExportFieldSpecs;

    // Feature's catalog will come from stored FieldDefinition rows (seeded in a later slice), not here.
    public IReadOnlyList<Shared.Schema.CatalogFieldSpec> CatalogFields => Array.Empty<Shared.Schema.CatalogFieldSpec>();

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Features live in the AI Solutions hub, not the passed workspace — access is the caller's hub
        // membership, enforced inside QueryAsync (null → the caller cannot see Features → 403).
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var query = new PaginatedQuery
            {
                Page = page,
                PageSize = ExportPageSize,
                Filters = null,
                Sort = new List<SortSpec>(),
            };

            var result = await _features.QueryAsync(userId, query, cancellationToken).ConfigureAwait(false);
            if (result is null)
            {
                return null;
            }

            foreach (var row in result.Items)
            {
                rows.Add(ProjectRow(row));
            }

            if (result.Items.Count < ExportPageSize || rows.Count >= result.TotalCount)
            {
                break;
            }

            page++;
        }

        var trimmed = rows.Count > _options.MaxExportRows
            ? rows.Take(_options.MaxExportRows).ToList()
            : rows;

        return new ExportDataset(ExportFieldSpecs, trimmed);
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

    private static IReadOnlyDictionary<string, object?> ProjectRow(FeatureListRowDto row) =>
        new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["id"] = row.Id,
            ["name"] = row.Name,
            ["oneLiner"] = row.OneLiner,
            ["featureType"] = row.FeatureType,
            ["capabilityTags"] = string.Join(MultiValueSeparator, row.CapabilityTags),
            ["techStack"] = string.Join(MultiValueSeparator, row.TechStack),
            ["owner"] = row.Owner,
            ["maturity"] = row.Maturity,
            ["origin"] = row.Origin,
            ["updated"] = row.UpdatedAt,
        };

    private static string? Value(IReadOnlyDictionary<string, string?> fieldValues, string key) =>
        fieldValues.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
}
