// Unit tests for ClosureService (Slice 10 — Closure, BS §8). The pure Validate() and the pre-persist
// branches are covered here; the usp_CloseRequest happy path is covered by tSQLt + the LocalDB
// round-trip (api-testing-guidelines.md). Covers: Duplicate-needs-target validation, 403 when the
// record isn't visible / caller isn't Member+, and cancellation propagation.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Closure;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ClosureServiceTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = new("B0000000-0000-4000-8000-000000000001");
    private const string RecordId = "AIS-00000007";

    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();
    private readonly Mock<IEventSpine> _eventSpine = new();
    private readonly Mock<IClock> _clock = new();

    public ClosureServiceTests()
    {
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, WorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
    }

    // A never-connected DbContext — the branches under test return before any DB call.
    private static AppDbContext DbContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=(localdb)\\unused;Database=unused;Trusted_Connection=True")
            .Options);

    private ClosureService Build() =>
        new(DbContext(), _requests.Object, _accessGuard.Object, _eventSpine.Object, _clock.Object);

    private static RequestDto Record() =>
        new(
            Id: RecordId, WorkspaceId: WorkspaceId, Origin: "AI Solutions",
            CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow, CreatedBy: "seed", UpdatedBy: "seed",
            LegacyId: null, LifecycleId: Guid.NewGuid(), Stages: Array.Empty<RequestStageRef>(), Stage: "execution",
            StatusHold: RequestStatusHoldValue.InProgress, StatusHoldNote: null,
            Hold: new HoldState(false, null), Outcome: null, DisplayStatus: "Execution", SlaStatus: null, TimeInStage: null,
            Name: "Extractor", Description: "desc", Fields: new Dictionary<string, JsonElement>(StringComparer.Ordinal),
            Bridge: null, ETag: "AAAAAAAAAGQ=");

    private static RequestCloseRequest CloseWith(string kind, string value, string? duplicateOf = null) =>
        new() { Outcome = new OutcomeInput { Kind = kind, Value = value, DuplicateOfRecordId = duplicateOf } };

    [Fact]
    public void Validate_DuplicateWithoutTarget_ReportsError()
    {
        // Arrange + Act
        var errors = ClosureService.Validate(CloseWith("local", "Duplicate"));

        // Assert
        Assert.True(errors.ContainsKey("outcome.duplicateOfRecordId"));
    }

    [Fact]
    public void Validate_DuplicateWithTarget_Passes()
    {
        // Arrange + Act
        var errors = ClosureService.Validate(CloseWith("local", "Duplicate", "AIS-00000002"));

        // Assert
        Assert.Empty(errors);
    }

    [Fact]
    public async Task CloseAsync_DuplicateWithoutTarget_ReturnsValidationFailed()
    {
        // Arrange — validation runs before any read, so no record setup is needed.
        // Act
        var result = await Build().CloseAsync(RecordId, CloseWith("local", "Duplicate"), ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(CloseOutcome.ValidationFailed, result.Outcome);
    }

    [Fact]
    public async Task CloseAsync_RecordNotVisible_ReturnsDenied()
    {
        // Arrange — a forbidden or non-existent record both read as null (403, never 404).
        _requests.Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>())).ReturnsAsync((RequestDto?)null);

        // Act
        var result = await Build().CloseAsync(RecordId, CloseWith("delivery", "Live"), ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(CloseOutcome.Denied, result.Outcome);
    }

    [Fact]
    public async Task CloseAsync_CallerNotMember_ReturnsDenied()
    {
        // Arrange — visible (Viewer) but lacks Member+, which closing requires.
        _requests.Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>())).ReturnsAsync(Record());
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, WorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        // Act
        var result = await Build().CloseAsync(RecordId, CloseWith("delivery", "Live"), ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(CloseOutcome.Denied, result.Outcome);
    }

    [Fact]
    public async Task CloseAsync_Cancellation_Propagates()
    {
        // Arrange
        _requests
            .Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().CloseAsync(RecordId, CloseWith("delivery", "Live"), ActorId, "op-1", cts.Token));
    }
}
