// Unit tests for TypedLinksService (Slice 10 — typed links, BS §2.2). The pre-persist branches (the
// access gate through the FROM record, the self-link guard) are covered here; the usp_CreateTypedLink /
// usp_GetTypedLinksForRecord / usp_DeleteTypedLink happy paths are covered by tSQLt + the LocalDB
// round-trip (api-testing-guidelines.md). Covers: null (403) when the record isn't visible on list /
// add, self-link → Invalid, and cancellation propagation.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.TypedLinks;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TypedLinksServiceTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = new("B0000000-0000-4000-8000-000000000001");
    private const string RecordId = "AIS-00000009";

    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<IEventSpine> _eventSpine = new();
    private readonly Mock<IClock> _clock = new();

    private static AppDbContext DbContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=(localdb)\\unused;Database=unused;Trusted_Connection=True")
            .Options);

    private TypedLinksService Build() => new(DbContext(), _requests.Object, _eventSpine.Object, _clock.Object);

    private static RequestDto Record() =>
        new(
            Id: RecordId, WorkspaceId: WorkspaceId, Origin: "AI Solutions",
            CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow, CreatedBy: "seed", UpdatedBy: "seed",
            LegacyId: null, LifecycleId: Guid.NewGuid(), LifecycleName: "Standard AI build", Stages: Array.Empty<RequestStageRef>(), Stage: "execution",
            StatusHold: RequestStatusHoldValue.InProgress, StatusHoldNote: null,
            Hold: new HoldState(false, null), Outcome: null, DisplayStatus: "Execution", SlaStatus: null, TimeInStage: null,
            Name: "Extractor", Description: "desc", Fields: new Dictionary<string, JsonElement>(StringComparer.Ordinal),
            Bridge: null, ETag: "AAAAAAAAAGQ=");

    private void SetupRecord(RequestDto? record) =>
        _requests.Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>())).ReturnsAsync(record);

    [Fact]
    public async Task GetLinksAsync_RecordNotVisible_ReturnsNull()
    {
        // Arrange — a forbidden or non-existent record reads as null (→ 403, never 404).
        SetupRecord(null);

        // Act
        var result = await Build().GetLinksAsync(RecordId, ActorId, CancellationToken.None);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task AddLinkAsync_RecordNotVisible_ReturnsForbidden()
    {
        // Arrange
        SetupRecord(null);
        var request = new AddLinkRequest { ToRecordId = "AIS-00000010", Kind = "related" };

        // Act
        var result = await Build().AddLinkAsync(RecordId, request, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(AddLinkOutcome.Forbidden, result.Outcome);
    }

    [Fact]
    public async Task AddLinkAsync_SelfLink_ReturnsInvalid()
    {
        // Arrange — a record cannot link to itself (caught before any DB call).
        SetupRecord(Record());
        var request = new AddLinkRequest { ToRecordId = RecordId, Kind = "related" };

        // Act
        var result = await Build().AddLinkAsync(RecordId, request, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(AddLinkOutcome.Invalid, result.Outcome);
        Assert.True(result.Errors!.ContainsKey("toRecordId"));
    }

    [Fact]
    public async Task AddLinkAsync_EmptyTarget_ReturnsInvalid()
    {
        // Arrange
        SetupRecord(Record());
        var request = new AddLinkRequest { ToRecordId = "   ", Kind = "related" };

        // Act
        var result = await Build().AddLinkAsync(RecordId, request, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(AddLinkOutcome.Invalid, result.Outcome);
    }

    [Fact]
    public async Task GetLinksAsync_Cancellation_Propagates()
    {
        // Arrange
        _requests
            .Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().GetLinksAsync(RecordId, ActorId, cts.Token));
    }
}
