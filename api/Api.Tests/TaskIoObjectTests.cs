// Unit tests for TaskIoObject (S28 wizards; onto the manifest — field-surfacing sweep). Task is
// export-only: verifies the export field specs (identity column, no import fields, no catalog
// synthesis), that BuildExportAsync projects the workspace task query into an export dataset
// (resolving the assignee and creator names, surfacing the captured typed field, leaving an
// unassigned task's name null), pages past a full batch, trims at the row cap, and propagates
// cancellation. ITasksService is mocked — the descriptor has no DbContext, so every branch is
// unit-testable.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Tasks;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class TaskIoObjectTests
{
    private static readonly Guid WorkspaceId = new("1A150000-0000-4000-8000-000000000001");
    private static readonly Guid ActorId = Guid.NewGuid();

    private readonly Mock<ITasksService> _tasks = new();

    private TaskIoObject Build(ImportExportOptions? options = null) =>
        new(_tasks.Object, Options.Create(options ?? new ImportExportOptions()));

    private static WorkspaceTaskExportRow Row(string recordId, string title, string? assigneeName) =>
        new()
        {
            TaskId = Guid.NewGuid(),
            RecordId = recordId,
            Title = title,
            Phase = "Build",
            Status = "Open",
            Notes = "note",
            CompletedAt = null,
            CreatedAt = new DateTime(2026, 7, 24, 9, 0, 0, DateTimeKind.Utc),
            AssigneeUserId = assigneeName is null ? null : Guid.NewGuid(),
            AssigneeName = assigneeName,
            CreatedByName = "Robin Diaz",
            FieldLabel = "Environment",
            FieldValue = "Production",
        };

    private void SetupPage(int page, IReadOnlyList<WorkspaceTaskExportRow> rows) =>
        _tasks
            .Setup(service => service.QueryWorkspaceTasksAsync(WorkspaceId, page, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(rows);

    [Fact]
    public async Task Metadata_IsExportOnly_WithIdentityColumnAndNoImportOrCatalogFields()
    {
        var sut = Build();
        var exportFields = await sut.GetExportFieldsAsync(WorkspaceId, ActorId, CancellationToken.None);

        Assert.Equal("Task", sut.ObjectType);
        Assert.Equal("Tasks", sut.Label);
        Assert.False(sut.CanImport);
        Assert.True(sut.CanExport);
        Assert.Empty(sut.ImportFields);
        // Task's catalog is stored-driven (migration 075 Global rows + task-field library + system
        // auto-fields), so the manifest contributes no built-in catalog rows.
        Assert.Empty(sut.CatalogFields);
        Assert.Contains(exportFields, field => field.Key == "task" && field.AlwaysIncluded);
        Assert.Contains(exportFields, field => field.Key == "request");
        Assert.Contains(exportFields, field => field.Key == "completedDate");
        // Newly surfaced columns (created date/by + the captured typed field).
        Assert.Contains(exportFields, field => field.Key == "createdAt");
        Assert.Contains(exportFields, field => field.Key == "createdBy");
        Assert.Contains(exportFields, field => field.Key == "field");
        Assert.Contains(exportFields, field => field.Key == "fieldValue");
    }

    [Fact]
    public async Task BuildExportAsync_ProjectsRows_ResolvingAssigneeCreatorAndCapturedField()
    {
        // Arrange — one page of two tasks; the second is unassigned.
        SetupPage(1, new[]
        {
            Row("LIT-9004", "Draft brief", "Alex Chen"),
            Row("LIT-9004", "Review", null),
        });

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Equal(2, dataset!.Rows.Count);
        Assert.Equal("Draft brief", dataset.Rows[0]["task"]);
        Assert.Equal("LIT-9004", dataset.Rows[0]["request"]);
        Assert.Equal("Alex Chen", dataset.Rows[0]["assignee"]);
        Assert.Equal("Robin Diaz", dataset.Rows[0]["createdBy"]);
        Assert.Equal("Environment", dataset.Rows[0]["field"]);
        Assert.Equal("Production", dataset.Rows[0]["fieldValue"]);
        Assert.Equal(new DateTime(2026, 7, 24, 9, 0, 0, DateTimeKind.Utc), dataset.Rows[0]["createdAt"]);
        Assert.Null(dataset.Rows[1]["assignee"]);
    }

    [Fact]
    public async Task BuildExportAsync_NeverReturnsNull_ForWorkspaceScopedObject()
    {
        // Arrange — an empty workspace still exports an empty dataset, never null (Viewer gate is upstream).
        SetupPage(1, Array.Empty<WorkspaceTaskExportRow>());

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Empty(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_PagesPastAFullBatch()
    {
        // Arrange — a full first page (100) forces a second fetch; page 2 holds the last row.
        var fullPage = Enumerable.Range(0, 100).Select(index => Row("LIT-9004", $"Task {index}", null)).ToList();
        SetupPage(1, fullPage);
        SetupPage(2, new[] { Row("LIT-9004", "Last", null) });

        // Act
        var dataset = await Build().BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert — both pages are collected, and the second page was actually requested.
        Assert.NotNull(dataset);
        Assert.Equal(101, dataset!.Rows.Count);
        _tasks.Verify(
            service => service.QueryWorkspaceTasksAsync(WorkspaceId, 2, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task BuildExportAsync_StopsAtRowCap()
    {
        // Arrange — a small export cap; the query returns more, but the descriptor trims.
        var options = new ImportExportOptions { MaxExportRows = 1 };
        SetupPage(1, new[]
        {
            Row("LIT-9004", "Alpha", null),
            Row("LIT-9004", "Beta", null),
        });

        // Act
        var dataset = await Build(options).BuildExportAsync(WorkspaceId, ActorId, CancellationToken.None);

        // Assert
        Assert.NotNull(dataset);
        Assert.Single(dataset!.Rows);
    }

    [Fact]
    public async Task BuildExportAsync_CancellationPropagates()
    {
        _tasks
            .Setup(service => service.QueryWorkspaceTasksAsync(
                WorkspaceId, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build().BuildExportAsync(WorkspaceId, ActorId, cts.Token));
    }
}
