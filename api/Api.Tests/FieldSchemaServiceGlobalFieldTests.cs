// Unit tests for FieldSchemaService's platform Global-object field upsert/retire path (SP3b
// Slice 2a, Task 3). Covers only the database-free guard branch: a non-existent / non-Global /
// built-in objectKey short-circuits to NotFound via IObjectSchemaService.ListGlobalAsync, before
// either method ever touches _db (ReadFieldsAsync). The DB-backed branches (Conflict,
// ValidationFailed, Success) call ReadFieldsAsync/ReadDependenciesAsync — real FromSqlRaw calls
// against dbo.FieldDefinition/dbo.FieldRuleDependency — before validation runs, so they need a
// real relational provider, not a unit-test double (mirrors CustomRecordsServiceTests). Those
// paths are covered by the tSQLt tests (usp_UpsertFieldDefinition / usp_RetireFieldDefinition
// Global-namespace tests, usp_GetWorkspaceFieldDependencies Global-edge tests) and the platform
// controller tests (Task 4).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Rules;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FieldSchemaServiceGlobalFieldTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    // The context is never touched on the tested (guard) branch — it short-circuits before any
    // _db access via ReadFieldsAsync — so an unconfigured options object is enough; construction
    // does not require a provider (mirrors CustomRecordsServiceTests.Db()).
    private static AppDbContext Db() => new(new DbContextOptionsBuilder<AppDbContext>().Options);

    private static ObjectDefinitionDto GlobalCustomObject(string objectKey = "vendorReview") => new(
        Guid.NewGuid(), Guid.Empty, objectKey, "Vendor Review", "Vendor Reviews", "Global", null,
        ShowInSidebar: true, SidebarCategory: null, RecordsCount: 0, FieldsCount: 0, IsSystem: false);

    private static ObjectDefinitionDto LocalWorkspaceObject(string objectKey) => new(
        Guid.NewGuid(), Guid.NewGuid(), objectKey, "Vendor Review", "Vendor Reviews", "LocalWorkspace", null,
        ShowInSidebar: true, SidebarCategory: null, RecordsCount: 0, FieldsCount: 0, IsSystem: false);

    private static (FieldSchemaService Sut, Mock<IObjectSchemaService> Objects) Build(
        IReadOnlyList<ObjectDefinitionDto>? globals = null)
    {
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.ListGlobalAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(globals ?? Array.Empty<ObjectDefinitionDto>());

        var sut = new FieldSchemaService(
            Db(),
            new Mock<IConditionEngine>().Object,
            new Mock<IEventSpine>().Object,
            new Mock<IClock>().Object,
            Array.Empty<IIoObject>(),
            objects.Object);
        return (sut, objects);
    }

    private static FieldDefinitionUpsertRequest SampleRequest(string fieldKey = "priority") => new()
    {
        FieldKey = fieldKey,
        DisplayName = "Priority",
        FieldType = "ShortText",
        Category = "WorkspaceLocal",
    };

    // ─── UpsertGlobalObjectFieldAsync — NotFound guard (no DB access) ──────────────────────────

    [Fact]
    public async Task UpsertGlobalObjectFieldAsync_UnresolvableObjectKey_ReturnsNotFound()
    {
        // Arrange — the platform's known Global objects do not include "unknownSlug".
        var (sut, _) = Build(globals: new[] { GlobalCustomObject("vendorReview") });

        // Act
        var result = await sut.UpsertGlobalObjectFieldAsync(
            "unknownSlug", SampleRequest(), isCreate: true, UserId, CancellationToken.None);

        // Assert
        Assert.Equal(FieldOperationOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task UpsertGlobalObjectFieldAsync_BuiltInGlobalObjectKey_ReturnsNotFound()
    {
        // Arrange — Request/Task are Global built-ins (IsSystem=true); the guard requires
        // IsSystem=false, so a built-in objectKey is rejected the same as an unresolvable one —
        // a platform admin manages custom Global object fields here, not built-in object schema.
        var builtIn = ObjectSchemaService.GetGlobalSystemObjects().Single(o => o.ObjectKey == "Request");
        var (sut, _) = Build(globals: new[] { builtIn });

        // Act
        var result = await sut.UpsertGlobalObjectFieldAsync(
            "Request", SampleRequest(), isCreate: true, UserId, CancellationToken.None);

        // Assert
        Assert.Equal(FieldOperationOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task UpsertGlobalObjectFieldAsync_LocalWorkspaceObjectKey_ReturnsNotFound()
    {
        // Arrange — a Global-object lookup must not match a LocalWorkspace-location object, even
        // if the same objectKey happens to be present in the candidate set under test.
        var (sut, _) = Build(globals: new[] { LocalWorkspaceObject("vendorReview") });

        // Act
        var result = await sut.UpsertGlobalObjectFieldAsync(
            "vendorReview", SampleRequest(), isCreate: true, UserId, CancellationToken.None);

        // Assert
        Assert.Equal(FieldOperationOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task UpsertGlobalObjectFieldAsync_CancelledToken_Propagates()
    {
        // Arrange
        var (sut, objects) = Build();
        objects.Setup(service => service.ListGlobalAsync(It.IsAny<CancellationToken>()))
            .Returns((CancellationToken token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<IReadOnlyList<ObjectDefinitionDto>>(Array.Empty<ObjectDefinitionDto>());
            });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert — exits via the cancellation exception, never reaching _db.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            sut.UpsertGlobalObjectFieldAsync("vendorReview", SampleRequest(), isCreate: true, UserId, cts.Token));
    }

    // ─── RetireGlobalObjectFieldAsync — NotFound guard (no DB access) ──────────────────────────

    [Fact]
    public async Task RetireGlobalObjectFieldAsync_UnresolvableObjectKey_ReturnsNotFound()
    {
        // Arrange
        var (sut, _) = Build(globals: new[] { GlobalCustomObject("vendorReview") });

        // Act
        var result = await sut.RetireGlobalObjectFieldAsync(
            "unknownSlug", "priority", UserId, CancellationToken.None);

        // Assert
        Assert.Equal(FieldOperationOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task RetireGlobalObjectFieldAsync_BuiltInGlobalObjectKey_ReturnsNotFound()
    {
        // Arrange
        var builtIn = ObjectSchemaService.GetGlobalSystemObjects().Single(o => o.ObjectKey == "Task");
        var (sut, _) = Build(globals: new[] { builtIn });

        // Act
        var result = await sut.RetireGlobalObjectFieldAsync("Task", "priority", UserId, CancellationToken.None);

        // Assert
        Assert.Equal(FieldOperationOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task RetireGlobalObjectFieldAsync_LocalWorkspaceObjectKey_ReturnsNotFound()
    {
        // Arrange
        var (sut, _) = Build(globals: new[] { LocalWorkspaceObject("vendorReview") });

        // Act
        var result = await sut.RetireGlobalObjectFieldAsync(
            "vendorReview", "priority", UserId, CancellationToken.None);

        // Assert
        Assert.Equal(FieldOperationOutcome.NotFound, result.Outcome);
    }

    [Fact]
    public async Task RetireGlobalObjectFieldAsync_CancelledToken_Propagates()
    {
        // Arrange
        var (sut, objects) = Build();
        objects.Setup(service => service.ListGlobalAsync(It.IsAny<CancellationToken>()))
            .Returns((CancellationToken token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<IReadOnlyList<ObjectDefinitionDto>>(Array.Empty<ObjectDefinitionDto>());
            });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            sut.RetireGlobalObjectFieldAsync("vendorReview", "priority", UserId, cts.Token));
    }

    // ─── GetGlobalObjectFieldsAsync — NotFound guard (no DB access) — Task 6 ───────────────────
    // Seeds the admin editor's edit flow with full field definitions (options/rules). Same guard
    // as Upsert/Retire above; the DB-backed success path (ReadFieldsAsync) is not unit-testable
    // without a real relational provider — see the platform controller tests (Task 4/6) instead.

    [Fact]
    public async Task GetGlobalObjectFieldsAsync_UnresolvableObjectKey_ReturnsNull()
    {
        // Arrange
        var (sut, _) = Build(globals: new[] { GlobalCustomObject("vendorReview") });

        // Act
        var result = await sut.GetGlobalObjectFieldsAsync("unknownSlug", CancellationToken.None);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task GetGlobalObjectFieldsAsync_BuiltInGlobalObjectKey_ReturnsNull()
    {
        // Arrange
        var builtIn = ObjectSchemaService.GetGlobalSystemObjects().Single(o => o.ObjectKey == "Request");
        var (sut, _) = Build(globals: new[] { builtIn });

        // Act
        var result = await sut.GetGlobalObjectFieldsAsync("Request", CancellationToken.None);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task GetGlobalObjectFieldsAsync_LocalWorkspaceObjectKey_ReturnsNull()
    {
        // Arrange
        var (sut, _) = Build(globals: new[] { LocalWorkspaceObject("vendorReview") });

        // Act
        var result = await sut.GetGlobalObjectFieldsAsync("vendorReview", CancellationToken.None);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task GetGlobalObjectFieldsAsync_CancelledToken_Propagates()
    {
        // Arrange
        var (sut, objects) = Build();
        objects.Setup(service => service.ListGlobalAsync(It.IsAny<CancellationToken>()))
            .Returns((CancellationToken token) =>
            {
                token.ThrowIfCancellationRequested();
                return Task.FromResult<IReadOnlyList<ObjectDefinitionDto>>(Array.Empty<ObjectDefinitionDto>());
            });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert — exits via the cancellation exception, never reaching _db.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            sut.GetGlobalObjectFieldsAsync("vendorReview", cts.Token));
    }
}
