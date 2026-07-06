// Pure outcome/status decisions for a CSV import (Slice 16). Translates a create-validation error map
// into typed per-row reasons (the ImportFlaggedRow.code union in imports.ts) and decides the job's
// terminal status from the row tallies. No IO — fully unit-tested. Messages are plain-language and
// carry no PII (they name the field and the rule, never the offending value — api-pii-handling.md).

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public static class ImportOutcomeMapper
{
    /// <summary>Reason recorded when a row's Requestor value can't be resolved to a firm user (SSO).</summary>
    public static ImportReasonDto UnresolvedRequestor(string field) => new(
        "unresolved-user",
        "The Requestor couldn't be matched to a firm user — the importing admin was used instead.",
        field);

    /// <summary>Companion fallback marker so the report is explicit that the record still landed (BS §13).</summary>
    public static ImportReasonDto RequestorFallback(string field) => new(
        "requestor-fallback",
        "Requestor defaulted to the importing admin.",
        field);

    /// <summary>Map RequestsService.ValidateCreate errors to typed row reasons.</summary>
    public static IReadOnlyList<ImportReasonDto> FromValidationErrors(IReadOnlyDictionary<string, string[]> errors)
    {
        var reasons = new List<ImportReasonDto>();
        foreach (var (field, messages) in errors)
        {
            var message = messages.Length > 0 ? messages[0] : "This value is not valid.";
            reasons.Add(new ImportReasonDto(CodeFor(field, message), message, field));
        }

        return reasons;
    }

    /// <summary>Single reason for a row that couldn't be imported for a non-validation reason.</summary>
    public static IReadOnlyList<ImportReasonDto> GenericFailure() => new[]
    {
        new ImportReasonDto("schema-validation", "This row couldn't be imported."),
    };

    /// <summary>
    /// Decide the job's terminal status. A parse failure (no header / unreadable file) is Failed. Any
    /// flagged row (hard failure or fallback warning) makes an otherwise-complete run CompletedWithErrors;
    /// a clean run is Completed.
    /// </summary>
    public static string DecideStatus(int totalRows, int flaggedRows, bool parseFailed)
    {
        if (parseFailed)
        {
            return "Failed";
        }

        return flaggedRows > 0 ? "CompletedWithErrors" : "Completed";
    }

    private static string CodeFor(string field, string message)
    {
        if (message.Contains("1 to 5", StringComparison.OrdinalIgnoreCase))
        {
            return "invalid-value";
        }

        return string.Equals(field, "name", StringComparison.OrdinalIgnoreCase)
            || string.Equals(field, "clientNumber", StringComparison.OrdinalIgnoreCase)
            ? "missing-required"
            : "schema-validation";
    }
}
