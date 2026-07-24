// Pure-unit tests for RequestsService.ApplyBenefitReviewDerivation (Time-based triggers — Slice 3).
// The Benefit-review date defaults from Deploy Date: when a request's deployDate is set/changed and its
// benefitReviewDate has NOT been manually overridden, benefitReviewDate = deployDate + BenefitReviewOffsetDays
// (BS §17.11). Resolved rule (plan Open Q2): recompute only if unedited — a hand-set Benefit-review date is
// never clobbered; a per-record `benefitReviewDateIsManual` marker records a direct user edit.
// api-testing-guidelines.md: happy + boundary + every branch; pure helper, no mocks required.

using System.Collections.Generic;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsBenefitReviewDerivationTests
{
    private const int OffsetDays = 90;

    private static JsonElement Str(string value) => JsonSerializer.SerializeToElement(value);

    private static JsonElement Bool(bool value) => JsonSerializer.SerializeToElement(value);

    private static string? FieldString(IReadOnlyDictionary<string, JsonElement> fields, string key) =>
        fields.TryGetValue(key, out var element) && element.ValueKind == JsonValueKind.String
            ? element.GetString()
            : null;

    [Fact]
    public void ApplyBenefitReviewDerivation_DeployDateSet_BenefitReviewUnset_AutoPopulatesDeployPlusOffset()
    {
        // Arrange — a patch sets deployDate on a record with no benefit-review date yet.
        var merged = new Dictionary<string, JsonElement> { ["deployDate"] = Str("2026-01-01") };
        var patch = new Dictionary<string, JsonElement> { ["deployDate"] = Str("2026-01-01") };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, patch, OffsetDays);

        // Assert — 2026-01-01 + 90 days.
        Assert.Equal("2026-04-01", FieldString(merged, "benefitReviewDate"));
    }

    [Fact]
    public void ApplyBenefitReviewDerivation_ManualMarkerSet_DoesNotOverwrite()
    {
        // Arrange — the benefit-review date was hand-set earlier (marker true); a later patch moves deployDate.
        var merged = new Dictionary<string, JsonElement>
        {
            ["deployDate"] = Str("2026-01-01"),
            ["benefitReviewDate"] = Str("2026-12-31"),
            ["benefitReviewDateIsManual"] = Bool(true),
        };
        var patch = new Dictionary<string, JsonElement> { ["deployDate"] = Str("2026-01-01") };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, patch, OffsetDays);

        // Assert — the hand-set value survives untouched.
        Assert.Equal("2026-12-31", FieldString(merged, "benefitReviewDate"));
    }

    [Fact]
    public void ApplyBenefitReviewDerivation_UserEditsBenefitReview_MarksManual_HonorsValueOverDeploy()
    {
        // Arrange — a single patch sets BOTH deployDate and benefitReviewDate. The explicit edit wins.
        var merged = new Dictionary<string, JsonElement>
        {
            ["deployDate"] = Str("2026-01-01"),
            ["benefitReviewDate"] = Str("2026-06-15"),
        };
        var patch = new Dictionary<string, JsonElement>
        {
            ["deployDate"] = Str("2026-01-01"),
            ["benefitReviewDate"] = Str("2026-06-15"),
        };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, patch, OffsetDays);

        // Assert — value honored (not recomputed to 2026-04-01) and the record is marked manual.
        Assert.Equal("2026-06-15", FieldString(merged, "benefitReviewDate"));
        Assert.True(merged.TryGetValue("benefitReviewDateIsManual", out var marker) && marker.GetBoolean());
    }

    [Fact]
    public void ApplyBenefitReviewDerivation_NoDeployDateInPatch_NoOp()
    {
        // Arrange — a content-only patch that never touches deployDate or benefitReviewDate.
        var merged = new Dictionary<string, JsonElement> { ["name"] = Str("Some request") };
        var patch = new Dictionary<string, JsonElement> { ["name"] = Str("Some request") };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, patch, OffsetDays);

        // Assert — no benefit-review date is invented.
        Assert.False(merged.ContainsKey("benefitReviewDate"));
    }

    [Fact]
    public void ApplyBenefitReviewDerivation_DeployDateChanged_UneditedBenefitReview_Recomputes()
    {
        // Arrange — an auto-set benefit-review date exists (no manual marker); the patch moves deployDate.
        var merged = new Dictionary<string, JsonElement>
        {
            ["deployDate"] = Str("2026-02-01"),
            ["benefitReviewDate"] = Str("2026-04-01"),
        };
        var patch = new Dictionary<string, JsonElement> { ["deployDate"] = Str("2026-02-01") };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, patch, OffsetDays);

        // Assert — recomputed from the new deploy date: 2026-02-01 + 90 days.
        Assert.Equal("2026-05-02", FieldString(merged, "benefitReviewDate"));
    }

    [Fact]
    public void ApplyBenefitReviewDerivation_DeployDateClearedToEmpty_NoOp()
    {
        // Arrange — the patch clears deployDate to an empty string (no valid base to compute from).
        var merged = new Dictionary<string, JsonElement> { ["deployDate"] = Str(string.Empty) };
        var patch = new Dictionary<string, JsonElement> { ["deployDate"] = Str(string.Empty) };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, patch, OffsetDays);

        // Assert — nothing computed.
        Assert.False(merged.ContainsKey("benefitReviewDate"));
    }

    [Fact]
    public void ApplyBenefitReviewDerivation_NullPatchFields_NoOp()
    {
        // Arrange — a create/patch with no field map at all (e.g. name-only change).
        var merged = new Dictionary<string, JsonElement> { ["deployDate"] = Str("2026-01-01") };

        // Act
        RequestsService.ApplyBenefitReviewDerivation(merged, null, OffsetDays);

        // Assert — no derivation without a patch that touched the inputs.
        Assert.False(merged.ContainsKey("benefitReviewDate"));
    }
}
