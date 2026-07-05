// Unit tests for the pure escalation-bridge helpers on RequestsService (no database): the AI Solutions
// Status mirror derivation (BS §6.4 — Deploy + Post-launch collapse to "Deployed"; hold + outcome
// take precedence), the locked-field-keys JSON parse, and the PATCH locked-field violation check
// (platform-defined keys always; PG-side crossing keys once escalated; unchanged values allowed).

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class BridgeDerivationTests
{
    [Theory]
    [InlineData("intake", "Intake")]
    [InlineData("discovery", "Discovery")]
    [InlineData("build", "Build")]
    [InlineData("qa", "QA")]
    [InlineData("deploy", "Deployed")]
    [InlineData("post-launch", "Deployed")]
    public void DeriveMirrorStatus_MapsStageToMirrorVocabulary(string aiStage, string expected)
    {
        // Act
        var status = RequestsService.DeriveMirrorStatus(aiStage, "{}");

        // Assert
        Assert.Equal(expected, status);
    }

    [Fact]
    public void DeriveMirrorStatus_HoldTakesPrecedenceOverStage()
    {
        // Act
        var status = RequestsService.DeriveMirrorStatus("build", """{"holdBlocked":"true"}""");

        // Assert
        Assert.Equal("On hold", status);
    }

    [Fact]
    public void DeriveMirrorStatus_OutcomeTakesPrecedenceOverStageAndHold()
    {
        // Act — a closed AI record shows its outcome on the PG mirror.
        var status = RequestsService.DeriveMirrorStatus("deploy", """{"outcome":"Live","holdBlocked":"true"}""");

        // Assert
        Assert.Equal("Live", status);
    }

    [Fact]
    public void ParseLockedFieldKeys_ReadsKeyObjects()
    {
        // Act
        var keys = RequestsService.ParseLockedFieldKeys("""[{"key":"deptPgClient"},{"key":"requestor"}]""");

        // Assert
        Assert.Equal(new[] { "deptPgClient", "requestor" }, keys);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("[]")]
    [InlineData("not json")]
    public void ParseLockedFieldKeys_EmptyOrMalformed_ReturnsEmpty(string? json)
    {
        // Act + Assert
        Assert.Empty(RequestsService.ParseLockedFieldKeys(json));
    }

    private static Dictionary<string, JsonElement> Fields(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void IsLockedFieldViolation_PlatformDefinedKey_AlwaysBlocked()
    {
        // Arrange — no crossing lock, but the patch tries to write the platform-defined mirror field.
        var request = new RequestPatchRequest { Fields = Fields("""{"ai-solutions-status":"Build"}"""), IfMatch = "e" };

        // Act
        var violated = RequestsService.IsLockedFieldViolation(
            request, Array.Empty<string>(), "Name", "Desc", Fields("{}"));

        // Assert
        Assert.True(violated);
    }

    [Fact]
    public void IsLockedFieldViolation_ChangingLockedCrossingField_Blocked()
    {
        // Arrange — deptPgClient is frozen on the PG side and the patch changes it.
        var request = new RequestPatchRequest { Fields = Fields("""{"deptPgClient":"Corporate"}"""), IfMatch = "e" };

        // Act
        var violated = RequestsService.IsLockedFieldViolation(
            request, new[] { "deptPgClient" }, "Name", "Desc", Fields("""{"deptPgClient":"Litigation"}"""));

        // Assert
        Assert.True(violated);
    }

    [Fact]
    public void IsLockedFieldViolation_ResendingUnchangedLockedName_Allowed()
    {
        // Arrange — the autosave re-sends the (locked, unchanged) name alongside an editable field.
        var request = new RequestPatchRequest { Name = "Contract clause finder", Fields = Fields("{}"), IfMatch = "e" };

        // Act
        var violated = RequestsService.IsLockedFieldViolation(
            request, new[] { "name" }, "Contract clause finder", "Desc", Fields("{}"));

        // Assert
        Assert.False(violated);
    }

    [Fact]
    public void IsLockedFieldViolation_NoLockAndNoPlatformKey_Allowed()
    {
        // Arrange — a non-escalated record: no locked keys, ordinary content edit.
        var request = new RequestPatchRequest { Fields = Fields("""{"assignedAnalyst":"Robin"}"""), IfMatch = "e" };

        // Act
        var violated = RequestsService.IsLockedFieldViolation(
            request, Array.Empty<string>(), "Name", "Desc", Fields("{}"));

        // Assert
        Assert.False(violated);
    }
}
