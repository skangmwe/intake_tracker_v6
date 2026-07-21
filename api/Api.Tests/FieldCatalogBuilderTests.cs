// Unit tests for FieldSchemaService.BuildCatalogRows — the pure catalog composition behind the
// reconciled S30 Fields tab (system-field synthesis, dedup, source/status/location/readonly mapping).
// No database — the stored rows are supplied directly (mirrors ObjectSchemaService.BuildSystemObjects).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Fields;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FieldCatalogBuilderTests
{
    private static FieldCatalogRow Stored(
        string objectType, string key, string type = "ShortText", string location = "LocalWorkspace",
        bool isRequired = false, bool isReadOnly = false, bool isPlatformDefined = false,
        bool isSystemProvisioned = false, bool isRetired = false, bool isLocal = true) => new()
    {
        FieldDefinitionId = Guid.NewGuid(),
        WorkspaceId = Guid.NewGuid(),
        ObjectType = objectType,
        FieldKey = key,
        DisplayName = key,
        FieldType = type,
        Location = location,
        IsRequired = isRequired,
        IsReadOnly = isReadOnly,
        IsPlatformDefined = isPlatformDefined,
        IsSystemProvisioned = isSystemProvisioned,
        IsRetired = isRetired,
        IsLocal = isLocal,
    };

    [Fact]
    public void BuildCatalogRows_SynthesisesFiveSystemFieldsPerObject()
    {
        // Act
        var rows = FieldSchemaService.BuildCatalogRows(Array.Empty<FieldCatalogRow>());

        // Assert — five built-in objects × five system auto-fields = 25 read-only, Global, System rows.
        var systemRows = rows.Where(row => row.Source == "System").ToList();
        Assert.Equal(25, systemRows.Count);
        Assert.All(systemRows, row =>
        {
            Assert.Equal("Global", row.Location);
            Assert.Equal("Active", row.Status);
            Assert.True(row.IsReadOnly);
            Assert.True(row.IsRequired);
        });
        Assert.Contains(rows, row => row.ObjectType == "ToolkitItem" && row.ObjectLabel == "Toolkit item");
    }

    [Fact]
    public void BuildCatalogRows_CustomField_IsAUserRowWithItsLocationAndStatus()
    {
        // Arrange
        var stored = new[] { Stored("Request", "severity", location: "Global", isRetired: true) };

        // Act
        var rows = FieldSchemaService.BuildCatalogRows(stored);

        // Assert
        var row = Assert.Single(rows, candidate => candidate.FieldKey == "severity");
        Assert.Equal("User", row.Source);
        Assert.Equal("Global", row.Location);
        Assert.Equal("Archived", row.Status);
        Assert.False(row.IsReadOnly);
    }

    [Fact]
    public void BuildCatalogRows_StoredKeyCollidingWithSystemAutoField_IsFoldedIntoTheSystemRow()
    {
        // Arrange — a stored 'name' row (e.g. the IsSystemProvisioned marker) must not duplicate the
        // synthesised "Name" system row.
        var stored = new[] { Stored("Request", "name", isSystemProvisioned: true) };

        // Act
        var rows = FieldSchemaService.BuildCatalogRows(stored);

        // Assert — exactly one Request/name row, and it is the synthesised System row.
        var nameRows = rows.Where(row => row.ObjectType == "Request" && row.FieldKey == "name").ToList();
        Assert.Single(nameRows);
        Assert.Equal("System", nameRows[0].Source);
    }

    [Fact]
    public void BuildCatalogRows_PlatformDefinedField_IsSystemSource()
    {
        var rows = FieldSchemaService.BuildCatalogRows(new[] { Stored("Feature", "aiStatus", isPlatformDefined: true) });
        var row = Assert.Single(rows, candidate => candidate.FieldKey == "aiStatus");
        Assert.Equal("System", row.Source);
        Assert.True(row.IsReadOnly);
    }

    [Fact]
    public void BuildCatalogRows_ForeignGlobalField_IsReadOnly()
    {
        // A Global field owned by another workspace (IsLocal = false) surfaces read-only here.
        var rows = FieldSchemaService.BuildCatalogRows(new[] { Stored("Request", "sharedPriority", location: "Global", isLocal: false) });
        var row = Assert.Single(rows, candidate => candidate.FieldKey == "sharedPriority");
        Assert.Equal("User", row.Source);
        Assert.True(row.IsReadOnly);
    }
}
