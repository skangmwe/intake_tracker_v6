// Unit tests for ObjectSchemaService.BuildSystemObjects (Objects tab, S30) — the pure composition of
// the five built-in object DTOs from a workspace's live counts. No database (the DB paths are covered
// by the tSQLt object procs + the controller tests).

using McDermott.AiTracker.Api.Modules.Objects;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ObjectSchemaServiceTests
{
    private static readonly Guid WorkspaceId = new("B0000000-0000-4000-8000-0000000000AA");

    private static ObjectRecordCountsRow Counts() => new()
    {
        RequestRecords = 128,
        TaskRecords = 642,
        AttachmentRecords = 311,
        FeatureRecords = 12,
        ToolkitRecords = 9,
        RequestFields = 7,
        TaskFields = 6,
        FeatureFields = 5,
    };

    [Fact]
    public void BuildSystemObjects_ReturnsFiveBuiltIns_AllSystemAndSidebarOn()
    {
        // Act
        var objects = ObjectSchemaService.BuildSystemObjects(WorkspaceId, Counts());

        // Assert
        Assert.Equal(5, objects.Count);
        Assert.All(objects, o => Assert.True(o.IsSystem));
        Assert.All(objects, o => Assert.True(o.ShowInSidebar));
        Assert.All(objects, o => Assert.Equal(WorkspaceId, o.WorkspaceId));
        Assert.Equal(new[] { "Request", "Task", "Attachment", "Feature", "Toolkit item" },
            objects.Select(o => o.Name).ToArray());
    }

    [Fact]
    public void BuildSystemObjects_MapsLiveRecordsAndFieldsCounts()
    {
        // Act
        var objects = ObjectSchemaService.BuildSystemObjects(WorkspaceId, Counts());
        var byName = objects.ToDictionary(o => o.Name);

        // Assert — records come from the backing tables; fields from FieldDefinition.
        Assert.Equal(128, byName["Request"].RecordsCount);
        Assert.Equal(7, byName["Request"].FieldsCount);
        Assert.Equal(642, byName["Task"].RecordsCount);
        Assert.Equal(6, byName["Task"].FieldsCount);
        Assert.Equal(12, byName["Feature"].RecordsCount);
        Assert.Equal(5, byName["Feature"].FieldsCount);
    }

    [Fact]
    public void BuildSystemObjects_AttachmentAndToolkit_HaveNoFieldSchema()
    {
        // Act
        var objects = ObjectSchemaService.BuildSystemObjects(WorkspaceId, Counts());
        var byName = objects.ToDictionary(o => o.Name);

        // Assert — records still count, but neither has a field schema (0 fields).
        Assert.Equal(311, byName["Attachment"].RecordsCount);
        Assert.Equal(0, byName["Attachment"].FieldsCount);
        Assert.Equal(9, byName["Toolkit item"].RecordsCount);
        Assert.Equal(0, byName["Toolkit item"].FieldsCount);
    }

    [Fact]
    public void BuildSystemObjects_CarriesCanonicalObjectKeyPerBuiltIn()
    {
        // Act
        var objects = ObjectSchemaService.BuildSystemObjects(WorkspaceId, Counts());
        var byName = objects.ToDictionary(o => o.Name);

        // Assert — ObjectKey is the canonical type key (matches FieldDefinition.ObjectType). Note the
        // Toolkit item's display name differs from its key ("ToolkitItem").
        Assert.Equal("Request", byName["Request"].ObjectKey);
        Assert.Equal("Task", byName["Task"].ObjectKey);
        Assert.Equal("Attachment", byName["Attachment"].ObjectKey);
        Assert.Equal("Feature", byName["Feature"].ObjectKey);
        Assert.Equal("ToolkitItem", byName["Toolkit item"].ObjectKey);
    }

    [Fact]
    public void BuildSystemObjects_LocationScoping_RequestAndTaskGlobal_RestLocal()
    {
        // Act
        var objects = ObjectSchemaService.BuildSystemObjects(WorkspaceId, Counts());
        var byName = objects.ToDictionary(o => o.Name);

        // Assert
        Assert.Equal("Global", byName["Request"].Location);
        Assert.Equal("Global", byName["Task"].Location);
        Assert.Equal("LocalWorkspace", byName["Attachment"].Location);
        Assert.Equal("LocalWorkspace", byName["Feature"].Location);
        Assert.Equal("LocalWorkspace", byName["Toolkit item"].Location);
    }

    [Fact]
    public void BuildCustomObjects_ReportsLiveFieldsAndRecordsCounts()
    {
        // Arrange — two custom objects; only 'vendor' has a counts row.
        var vendorId = new Guid("C0000000-0000-4000-8000-000000000001");
        var orderId = new Guid("C0000000-0000-4000-8000-000000000002");
        var rows = new List<ObjectDefinitionRow>
        {
            new() { ObjectDefinitionId = vendorId, ObjectKey = "vendor", Name = "Vendor", Location = "LocalWorkspace" },
            new() { ObjectDefinitionId = orderId, ObjectKey = "order", Name = "Order", Location = "LocalWorkspace" },
        };
        var counts = new List<CustomObjectCountsRow>
        {
            new() { ObjectDefinitionId = vendorId, FieldsCount = 3, RecordsCount = 5 },
        };

        // Act
        var objects = ObjectSchemaService.BuildCustomObjects(WorkspaceId, rows, counts);
        var byId = objects.ToDictionary(o => o.Id);

        // Assert — live counts from the counts row; the object with no counts row falls back to 0/0.
        Assert.Equal(3, byId[vendorId].FieldsCount);
        Assert.Equal(5, byId[vendorId].RecordsCount);
        Assert.Equal(0, byId[orderId].FieldsCount);
        Assert.Equal(0, byId[orderId].RecordsCount);
        Assert.All(objects, o => Assert.False(o.IsSystem));
        Assert.Equal("vendor", byId[vendorId].ObjectKey);
    }

    [Fact]
    public void GetGlobalSystemObjects_ReturnsRequestAndTaskOnly_ReadOnlyReferenceNoCounts()
    {
        // Act — the platform Objects tab (S34): only the Global built-ins, no workspace, no counts.
        var objects = ObjectSchemaService.GetGlobalSystemObjects();

        // Assert
        Assert.Equal(new[] { "Request", "Task" }, objects.Select(o => o.Name).ToArray());
        Assert.All(objects, o => Assert.Equal("Global", o.Location));
        Assert.All(objects, o => Assert.True(o.IsSystem));
        Assert.All(objects, o => Assert.Equal(Guid.Empty, o.WorkspaceId));
        Assert.All(objects, o => Assert.Equal(0, o.RecordsCount));
        Assert.All(objects, o => Assert.Equal(0, o.FieldsCount));
    }
}
