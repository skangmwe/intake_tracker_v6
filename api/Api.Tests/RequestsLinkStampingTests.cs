// Unit tests for the pure slice-10 helpers on RequestsService — no database, no mocks.
// BuildQueuedLinksJson merges the similar-requests nudge's `related` ids and Copy/Promote's kinded
// link-backs into the `[{ toRecordId, kind }]` array usp_CreateRequest stamps; MapOutcome rebuilds the
// Outcome block from the FieldValues written by usp_CloseRequest.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsLinkStampingTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static Dictionary<string, JsonElement> Fields(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, JsonOptions)!;

    [Fact]
    public void BuildQueuedLinksJson_NoLinks_ReturnsNull()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "X" };

        // Act
        var json = RequestsService.BuildQueuedLinksJson(request);

        // Assert
        Assert.Null(json);
    }

    [Fact]
    public void BuildQueuedLinksJson_RelatedIds_AreStampedAsRelated()
    {
        // Arrange
        var request = new RequestCreateRequest { Name = "X", QueuedRelatedRecordIds = new[] { "AIS-00000001", "  " } };

        // Act
        var json = RequestsService.BuildQueuedLinksJson(request);

        // Assert — the blank id is dropped; the real one is stamped as `related`.
        using var document = JsonDocument.Parse(json!);
        var element = Assert.Single(document.RootElement.EnumerateArray());
        Assert.Equal("AIS-00000001", element.GetProperty("toRecordId").GetString());
        Assert.Equal("related", element.GetProperty("kind").GetString());
    }

    [Fact]
    public void BuildQueuedLinksJson_KindedLinks_PreserveKind_AndDefaultBlankToRelated()
    {
        // Arrange
        var request = new RequestCreateRequest
        {
            Name = "X",
            QueuedLinks = new[]
            {
                new QueuedLinkInput { ToRecordId = "AIS-00000002", Kind = "re-pursuit-of" },
                new QueuedLinkInput { ToRecordId = "AIS-00000003", Kind = null },
            },
        };

        // Act
        var json = RequestsService.BuildQueuedLinksJson(request);

        // Assert
        using var document = JsonDocument.Parse(json!);
        var items = document.RootElement.EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        Assert.Equal("re-pursuit-of", items[0].GetProperty("kind").GetString());
        Assert.Equal("related", items[1].GetProperty("kind").GetString());
    }

    [Fact]
    public void MapOutcome_NoOutcome_ReturnsNull()
    {
        // Arrange
        var fields = Fields("""{ "businessValue": 4 }""");

        // Act
        var outcome = RequestsService.MapOutcome(fields);

        // Assert
        Assert.Null(outcome);
    }

    [Fact]
    public void MapOutcome_ClosedRecord_BuildsOutcomeBlock()
    {
        // Arrange — the shape usp_CloseRequest writes into FieldValues.
        var fields = Fields("""
            { "outcome": "Duplicate", "outcomeKind": "local", "outcomeNotes": "same as REQ-1", "duplicateOfRecordId": "LIT-00000001" }
            """);

        // Act
        var outcome = RequestsService.MapOutcome(fields);

        // Assert
        Assert.NotNull(outcome);
        Assert.Equal("Duplicate", outcome!.Value);
        Assert.Equal("local", outcome.Kind);
        Assert.Equal("same as REQ-1", outcome.Notes);
        Assert.Equal("LIT-00000001", outcome.DuplicateOfRecordId);
    }

    [Fact]
    public void MapOutcome_OutcomeWithoutKind_DefaultsToDelivery()
    {
        // Arrange
        var fields = Fields("""{ "outcome": "Live" }""");

        // Act
        var outcome = RequestsService.MapOutcome(fields);

        // Assert
        Assert.NotNull(outcome);
        Assert.Equal("delivery", outcome!.Kind);
        Assert.Null(outcome.DuplicateOfRecordId);
    }
}
