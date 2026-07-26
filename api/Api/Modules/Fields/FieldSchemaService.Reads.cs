// FieldSchemaService — the read, serialization, and dependency-derivation helpers. Split from
// the orchestration half (FieldSchemaService.cs) to keep each file focused.

using System.Text.Json;
using System.Text.RegularExpressions;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Fields;

public sealed partial class FieldSchemaService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // Identifiers referenced inside a Calculation expression (e.g. "businessValue + efficiencyGain").
    [GeneratedRegex(@"[A-Za-z_][A-Za-z0-9_]*")]
    private static partial Regex IdentifierPattern();

    // A '@fieldKey' reference in a produce-value / default (e.g. displayStatus produces "@outcome").
    [GeneratedRegex(@"^@([A-Za-z_][A-Za-z0-9_]*)$")]
    private static partial Regex FieldReferencePattern();

    private async Task<IReadOnlyList<FieldDefinitionDto>> ReadFieldsAsync(
        Guid workspaceId, string objectType, CancellationToken cancellationToken)
    {
        var fields = await _db.Set<FieldDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceFields @WorkspaceId, @ObjectType",
                new SqlParameter("@WorkspaceId", workspaceId), new SqlParameter("@ObjectType", objectType))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var options = await _db.Set<FieldOptionRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceFieldOptions @WorkspaceId, @ObjectType",
                new SqlParameter("@WorkspaceId", workspaceId), new SqlParameter("@ObjectType", objectType))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var rules = await _db.Set<FieldRuleRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceFieldRules @WorkspaceId, @ObjectType",
                new SqlParameter("@WorkspaceId", workspaceId), new SqlParameter("@ObjectType", objectType))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var optionsByField = options
            .GroupBy(option => option.FieldKey, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<SelectOptionDto>)group
                    .Select(option => new SelectOptionDto(option.SelectOptionId.ToString(), option.OptionValue, option.OptionLabel, option.SortOrder))
                    .ToList(),
                StringComparer.Ordinal);

        var rulesByField = rules
            .GroupBy(rule => rule.FieldKey, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<FieldRuleDto>)group
                    .Select(rule => new FieldRuleDto(rule.FieldRuleId.ToString(), rule.Action, rule.WhenFieldKey, rule.Comparator, rule.CompareValue, rule.ProduceValue, rule.SortOrder))
                    .ToList(),
                StringComparer.Ordinal);

        return fields.Select(row => new FieldDefinitionDto(
            row.FieldDefinitionId,
            row.WorkspaceId ?? Guid.Empty,
            row.ObjectType,
            row.FieldKey,
            row.DisplayName,
            row.FieldType,
            row.Category,
            row.Section,
            row.HelpText,
            row.IsRequired,
            row.IsReadOnly,
            row.IsPlatformDefined,
            row.IsSystemProvisioned,
            row.Location,
            row.IsLocal,
            row.PlatformFieldKey,
            ParseStringArray(row.VisibleStagesJson),
            row.CrossingToFieldKey,
            row.MinValue,
            row.MaxValue,
            row.AllowNewValues,
            row.SortOrder,
            row.IsRetired,
            optionsByField.TryGetValue(row.FieldKey, out var fieldOptions) ? fieldOptions : Array.Empty<SelectOptionDto>(),
            rulesByField.TryGetValue(row.FieldKey, out var fieldRules) ? fieldRules : Array.Empty<FieldRuleDto>(),
            row.DerivedKind is null ? null : new DerivedFieldDto(row.DerivedKind, row.DerivedExpression, row.DerivedDefaultValue),
            DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
            DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc)))
            .ToList();
    }

    private async Task<IReadOnlyList<PlatformFieldDto>> ReadPlatformBandAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<PlatformFieldRow>()
            .FromSqlRaw("EXEC dbo.usp_GetPlatformFields")
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(row => new PlatformFieldDto(
            row.PlatformFieldId,
            row.FieldKey,
            row.DisplayName,
            row.FieldType,
            row.Category,
            row.IsSystemImmutable,
            row.HasManualWritePath,
            ParseStringArray(row.SelectOptionsJson)))
            .ToList();
    }

    private async Task<IReadOnlyList<(string From, string To)>> ReadDependenciesAsync(
        Guid workspaceId, string objectType, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<FieldDependencyRow>()
            .FromSqlRaw("EXEC dbo.usp_GetWorkspaceFieldDependencies @WorkspaceId, @ObjectType",
                new SqlParameter("@WorkspaceId", workspaceId), new SqlParameter("@ObjectType", objectType))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.Select(row => (row.FromFieldKey, row.ToFieldKey)).ToList();
    }

    private async Task ExecuteUpsertAsync(
        Guid workspaceId, FieldDefinitionUpsertRequest request, IReadOnlyList<string> dependencies, Guid actorUserId, CancellationToken cancellationToken)
    {
        var optionsJson = request.Options is { Count: > 0 }
            ? JsonSerializer.Serialize(request.Options.Select(option => new { value = option.Value, label = option.Label, sortOrder = option.SortOrder }), JsonOptions)
            : null;

        var rulesJson = request.Rules is { Count: > 0 }
            ? JsonSerializer.Serialize(request.Rules.Select(rule => new
            {
                action = rule.Action,
                whenFieldKey = rule.WhenFieldKey,
                comparator = rule.Comparator,
                compareValue = rule.CompareValue,
                produceValue = rule.ProduceValue,
                sortOrder = rule.SortOrder,
            }), JsonOptions)
            : null;

        var dependenciesJson = dependencies.Count > 0 ? JsonSerializer.Serialize(dependencies, JsonOptions) : null;
        var visibleStagesJson = request.VisibleStages is { Count: > 0 } ? JsonSerializer.Serialize(request.VisibleStages, JsonOptions) : null;

        await _db.Database.ExecuteSqlRawAsync(
            @"EXEC dbo.usp_UpsertFieldDefinition
                @WorkspaceId, @ObjectType, @FieldKey, @DisplayName, @FieldType, @Category, @Location, @Section, @HelpText,
                @IsRequired, @VisibleStagesJson, @CrossingToFieldKey, @MinValue, @MaxValue, @AllowNewValues, @SortOrder,
                @DerivedKind, @DerivedExpression, @DerivedDefaultValue, @OptionsJson, @RulesJson, @DependenciesJson, @ActorUserId",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", request.ObjectType),
                new SqlParameter("@FieldKey", request.FieldKey),
                new SqlParameter("@DisplayName", request.DisplayName),
                new SqlParameter("@FieldType", request.FieldType),
                new SqlParameter("@Category", request.Category),
                new SqlParameter("@Location", request.Location),
                Nullable("@Section", request.Section),
                Nullable("@HelpText", request.HelpText),
                new SqlParameter("@IsRequired", request.IsRequired),
                Nullable("@VisibleStagesJson", visibleStagesJson),
                Nullable("@CrossingToFieldKey", request.CrossingToFieldKey),
                Nullable("@MinValue", request.MinValue),
                Nullable("@MaxValue", request.MaxValue),
                new SqlParameter("@AllowNewValues", request.AllowNewValues),
                new SqlParameter("@SortOrder", request.SortOrder),
                Nullable("@DerivedKind", request.Derived?.Kind),
                Nullable("@DerivedExpression", request.Derived?.Expression),
                Nullable("@DerivedDefaultValue", request.Derived?.DefaultValue),
                Nullable("@OptionsJson", optionsJson),
                Nullable("@RulesJson", rulesJson),
                Nullable("@DependenciesJson", dependenciesJson),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);
    }

    // The distinct set of field keys a field depends on — rule conditions, calculation operands,
    // and '@ref' produce/default values. This is what the graph check and the persisted edges use.
    private static IReadOnlyList<string> ComputeDependencies(FieldDefinitionUpsertRequest request)
    {
        var dependencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var rule in request.Rules ?? Array.Empty<FieldRuleInput>())
        {
            if (!string.IsNullOrWhiteSpace(rule.WhenFieldKey))
            {
                dependencies.Add(rule.WhenFieldKey);
            }

            AddFieldReference(dependencies, rule.ProduceValue);
        }

        if (request.Derived is { Kind: "Calculation", Expression: { } expression } && !string.IsNullOrWhiteSpace(expression))
        {
            foreach (Match match in IdentifierPattern().Matches(expression))
            {
                dependencies.Add(match.Value);
            }
        }

        AddFieldReference(dependencies, request.Derived?.DefaultValue);

        // A field never depends on itself.
        dependencies.Remove(request.FieldKey ?? string.Empty);
        return dependencies.ToList();
    }

    // The field keys an already-persisted field references — used by the retire dependency guard.
    private static IEnumerable<string> FieldReferences(FieldDefinitionDto field)
    {
        foreach (var rule in field.Rules)
        {
            yield return rule.WhenFieldKey;
            var produced = ReadFieldReference(rule.ProduceValue);
            if (produced is not null)
            {
                yield return produced;
            }
        }

        if (field.Derived is { Kind: "Calculation", Expression: { Length: > 0 } expression })
        {
            foreach (Match match in IdentifierPattern().Matches(expression))
            {
                yield return match.Value;
            }
        }

        var defaultRef = ReadFieldReference(field.Derived?.DefaultValue);
        if (defaultRef is not null)
        {
            yield return defaultRef;
        }
    }

    private static void AddFieldReference(HashSet<string> set, string? value)
    {
        var reference = ReadFieldReference(value);
        if (reference is not null)
        {
            set.Add(reference);
        }
    }

    private static string? ReadFieldReference(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var match = FieldReferencePattern().Match(value);
        return match.Success ? match.Groups[1].Value : null;
    }

    // Structural per-type validation the DTO annotations can't express (cross-field shape).
    private static List<string> ValidateFieldTypeShape(FieldDefinitionUpsertRequest request)
    {
        var errors = new List<string>();

        if (string.Equals(request.FieldType, "Calculation", StringComparison.Ordinal) &&
            !string.Equals(request.Derived?.Kind, "Calculation", StringComparison.Ordinal))
        {
            errors.Add("A Calculation field requires a derived Calculation configuration with an expression.");
        }

        if (string.Equals(request.FieldType, "DerivedCategory", StringComparison.Ordinal) &&
            !string.Equals(request.Derived?.Kind, "DerivedCategory", StringComparison.Ordinal))
        {
            errors.Add("A Derived-category field requires a derived DerivedCategory configuration.");
        }

        if (request.MinValue is { } min && request.MaxValue is { } max && min > max)
        {
            errors.Add("The minimum value cannot be greater than the maximum value.");
        }

        return errors;
    }

    private static IReadOnlyList<string>? ParseStringArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static SqlParameter Nullable(string name, object? value) => new(name, value ?? DBNull.Value);
}
