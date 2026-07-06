// Unit tests for ImportOutcomeMapper (Slice 16 — pure outcome/status decisions). Covers validation-
// error → typed reason-code mapping, the Requestor fallback/unresolved reasons, and the terminal-status
// decision from the row tallies.

using System.Collections.Generic;
using McDermott.AiTracker.Api.Modules.ImportExport;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ImportOutcomeMapperTests
{
    [Fact]
    public void FromValidationErrors_MapsFieldsToTypedCodes()
    {
        // Arrange — the three shapes RequestsService.ValidateCreate can return.
        var errors = new Dictionary<string, string[]>
        {
            ["name"] = new[] { "A request name is required." },
            ["businessValue"] = new[] { "Business Value must be a whole number from 1 to 5." },
            ["clientNumber"] = new[] { "A client number is required when Dept/PG/Client is Client." },
        };

        // Act
        var reasons = ImportOutcomeMapper.FromValidationErrors(errors);

        // Assert
        Assert.Equal("missing-required", Assert.Single(reasons, reason => reason.Field == "name").Code);
        Assert.Equal("invalid-value", Assert.Single(reasons, reason => reason.Field == "businessValue").Code);
        Assert.Equal("missing-required", Assert.Single(reasons, reason => reason.Field == "clientNumber").Code);
    }

    [Fact]
    public void RequestorReasons_CarryTheRightCodes()
    {
        // Act
        var unresolved = ImportOutcomeMapper.UnresolvedRequestor("requestor");
        var fallback = ImportOutcomeMapper.RequestorFallback("requestor");

        // Assert — an unresolved requestor lands the row but flags both the miss and the fallback.
        Assert.Equal("unresolved-user", unresolved.Code);
        Assert.Equal("requestor-fallback", fallback.Code);
        Assert.Equal("requestor", unresolved.Field);
    }

    [Theory]
    [InlineData(5, 0, false, "Completed")]
    [InlineData(5, 1, false, "CompletedWithErrors")]
    [InlineData(0, 0, true, "Failed")]
    public void DecideStatus_ReflectsTallies(int total, int flagged, bool parseFailed, string expected)
    {
        Assert.Equal(expected, ImportOutcomeMapper.DecideStatus(total, flagged, parseFailed));
    }

    [Fact]
    public void GenericFailure_IsSchemaValidation()
    {
        var reasons = ImportOutcomeMapper.GenericFailure();
        Assert.Equal("schema-validation", Assert.Single(reasons).Code);
    }
}
