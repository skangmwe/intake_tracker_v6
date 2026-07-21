// Unit tests for EscalationService's pre-persist branches (the DB proc happy path + the SqlException
// mappings are covered by the tSQLt EscalationTests and the slice-completion LocalDB round-trip —
// they need a real database, per api-testing-guidelines.md). Covers: 403 when the record is not
// visible / caller is not Member+, 409 when already escalated, 400 pending-edits, 400 missing required
// crossing field, and cancellation propagation.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Escalation;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Escalation;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class EscalationServiceTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid PgWorkspaceId = new("B0000000-0000-4000-8000-000000000002");
    private const string RecordId = "LIT-00000001";

    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<ICrossingMapReader> _crossingMap = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();
    private readonly Mock<IEventSpine> _eventSpine = new();
    private readonly Mock<IClock> _clock = new();

    public EscalationServiceTests()
    {
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, PgWorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _crossingMap
            .Setup(reader => reader.GetCrossingFieldsAsync(PgWorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CrossingFieldRow>());
    }

    // A never-connected DbContext — the pre-persist branches under test return before any DB call.
    private static AppDbContext DbContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=(localdb)\\unused;Database=unused;Trusted_Connection=True")
            .Options);

    private EscalationService Build() =>
        new(DbContext(), _requests.Object, _crossingMap.Object, _accessGuard.Object, _eventSpine.Object, _clock.Object);

    private static RequestDto PgRecord(
        BridgeBlockDto? bridge = null, IReadOnlyDictionary<string, JsonElement>? fields = null) =>
        new(
            Id: RecordId,
            WorkspaceId: PgWorkspaceId,
            Origin: "Litigation",
            CreatedAt: DateTime.UtcNow,
            UpdatedAt: DateTime.UtcNow,
            CreatedBy: "seed",
            UpdatedBy: "seed",
            LegacyId: null,
            LifecycleId: Guid.NewGuid(),
            Stages: Array.Empty<RequestStageRef>(),
            Stage: "intake",
            StatusHold: RequestStatusHoldValue.InProgress,
            StatusHoldNote: null,
            Hold: new HoldState(false, null),
            Outcome: null,
            DisplayStatus: "Intake",
            SlaStatus: null,
            TimeInStage: null,
            Name: "Contract clause finder",
            Description: "Find clauses fast.",
            Fields: fields ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal),
            Bridge: bridge,
            ETag: "AAAAAAAAAGQ=");

    private void SetupRecord(RequestDto? record) =>
        _requests.Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>())).ReturnsAsync(record);

    [Fact]
    public async Task EscalateAsync_RecordNotVisible_ReturnsDenied()
    {
        // Arrange — a forbidden or non-existent record both read as null (403, never 404).
        SetupRecord(null);

        // Act
        var result = await Build().EscalateAsync(RecordId, confirmPendingEdits: true, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(EscalateOutcome.Denied, result.Outcome);
    }

    [Fact]
    public async Task EscalateAsync_CallerNotMember_ReturnsDenied()
    {
        // Arrange — visible (Viewer) but lacks Member+, which escalation requires.
        SetupRecord(PgRecord());
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, PgWorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        // Act
        var result = await Build().EscalateAsync(RecordId, confirmPendingEdits: true, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(EscalateOutcome.Denied, result.Outcome);
    }

    [Fact]
    public async Task EscalateAsync_AlreadyEscalated_ReturnsAlreadyEscalated()
    {
        // Arrange — the record already carries a bridge block (one-time, one-way, BS §6.6).
        var bridge = new BridgeBlockDto(true, PgWorkspaceId, "Litigation", Guid.NewGuid(), DateTime.UtcNow, "Execution", Array.Empty<string>());
        SetupRecord(PgRecord(bridge));

        // Act
        var result = await Build().EscalateAsync(RecordId, confirmPendingEdits: true, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(EscalateOutcome.AlreadyEscalated, result.Outcome);
    }

    [Fact]
    public async Task EscalateAsync_ConfirmPendingEditsFalse_ReturnsPendingEdits()
    {
        // Arrange
        SetupRecord(PgRecord());

        // Act
        var result = await Build().EscalateAsync(RecordId, confirmPendingEdits: false, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(EscalateOutcome.PendingEdits, result.Outcome);
    }

    [Fact]
    public async Task EscalateAsync_MissingRequiredCrossingField_ReturnsMissingRequiredWithErrors()
    {
        // Arrange — a required crossing field ('requestor') that the PG record has not filled in.
        SetupRecord(PgRecord());
        _crossingMap
            .Setup(reader => reader.GetCrossingFieldsAsync(PgWorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                new CrossingFieldRow { FieldKey = "requestor", CrossingToFieldKey = "requestor", DisplayName = "Requestor", IsRequired = true },
            });

        // Act
        var result = await Build().EscalateAsync(RecordId, confirmPendingEdits: true, ActorId, "op-1", CancellationToken.None);

        // Assert
        Assert.Equal(EscalateOutcome.MissingRequired, result.Outcome);
        Assert.NotNull(result.Errors);
        Assert.True(result.Errors!.ContainsKey("requestor"));
    }

    [Fact]
    public async Task EscalateAsync_Cancellation_Propagates()
    {
        // Arrange
        _requests
            .Setup(service => service.GetByIdAsync(RecordId, ActorId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().EscalateAsync(RecordId, confirmPendingEdits: true, ActorId, "op-1", cts.Token));
    }
}
