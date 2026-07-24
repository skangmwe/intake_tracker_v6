// Unit tests for FieldSchemaService.BuildCatalogRows — the pure catalog composition behind the
// reconciled S30 Fields tab (system-field synthesis, dedup, source/status/location/readonly mapping).
// No database — the stored rows are supplied directly (mirrors ObjectSchemaService.BuildSystemObjects).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Shared.Schema;
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

    // ─── Built-in object fields (field-surfacing sweep — Attachment / Toolkit item) ─────────────

    private static CatalogFieldSpec BuiltIn(string objectType, string key, string type = "ShortText") =>
        new(objectType, key, key, type);

    [Fact]
    public void BuildCatalogRows_BuiltInFields_AreReadOnlySystemRowsUnderTheirObject()
    {
        // Arrange — two built-in Attachment fields (as an object descriptor would contribute).
        var builtIn = new[] { BuiltIn("Attachment", "fileName"), BuiltIn("Attachment", "contentType") };

        // Act
        var rows = FieldSchemaService.BuildCatalogRows(Array.Empty<FieldCatalogRow>(), builtIn);

        // Assert — surfaced under Attachment, read-only System rows, distinct from the 5 auto-fields.
        var built = rows.Where(row => row.Id.StartsWith("builtin:", System.StringComparison.Ordinal)).ToList();
        Assert.Equal(2, built.Count);
        Assert.All(built, row =>
        {
            Assert.Equal("Attachment", row.ObjectType);
            Assert.Equal("System", row.Source);
            Assert.True(row.IsReadOnly);
            Assert.False(row.IsRequired);
        });
        Assert.Contains(built, row => row.FieldKey == "fileName");
    }

    [Fact]
    public void BuildCatalogRows_BuiltInKeyCollidingWithSystemAutoField_IsSkipped()
    {
        // 'name' is a system auto-field — a built-in 'name' must not duplicate it.
        var rows = FieldSchemaService.BuildCatalogRows(
            Array.Empty<FieldCatalogRow>(), new[] { BuiltIn("Attachment", "name") });

        var nameRows = rows.Where(row => row.ObjectType == "Attachment" && row.FieldKey == "name").ToList();
        Assert.Single(nameRows);
        Assert.Equal("System", nameRows[0].Source);
        Assert.StartsWith("system:", nameRows[0].Id);
    }

    [Fact]
    public void BuildCatalogRows_BuiltInKeyCollidingWithStoredCustomField_YieldsTheStoredRow()
    {
        // An admin-created custom field of the same key wins over the built-in.
        var rows = FieldSchemaService.BuildCatalogRows(
            new[] { Stored("Attachment", "contentType") }, new[] { BuiltIn("Attachment", "contentType") });

        var contentTypeRows = rows.Where(row => row.ObjectType == "Attachment" && row.FieldKey == "contentType").ToList();
        Assert.Single(contentTypeRows);
        Assert.Equal("User", contentTypeRows[0].Source);
        Assert.DoesNotContain(rows, row => row.Id == "builtin:Attachment:contentType");
    }

    [Fact]
    public void BuildCatalogRows_DuplicateBuiltInKeys_AreDeduped()
    {
        var rows = FieldSchemaService.BuildCatalogRows(
            Array.Empty<FieldCatalogRow>(), new[] { BuiltIn("Attachment", "kind"), BuiltIn("Attachment", "kind") });

        Assert.Single(rows, row => row.ObjectType == "Attachment" && row.FieldKey == "kind");
    }

    // ─── Custom objects (Slice 1a — custom-object records) ──────────────────────────────────────

    [Fact]
    public void BuildCatalogRows_CustomObject_SynthesizesFiveSystemFields()
    {
        // Act — one custom object (slug "vendor"), no stored rows.
        var rows = FieldSchemaService.BuildCatalogRows(
            Array.Empty<FieldCatalogRow>(),
            Array.Empty<CatalogFieldSpec>(),
            new[] { ("vendor", "Vendor") });

        // Assert — the same five read-only System auto-fields as a built-in, labelled by the object's Name.
        var vendorRows = rows.Where(row => row.ObjectType == "vendor").ToList();
        Assert.Equal(
            new[] { "recordId", "name", "createdAt", "updatedAt", "createdBy" },
            vendorRows.Select(row => row.FieldKey).ToArray());
        Assert.All(vendorRows, row =>
        {
            Assert.Equal("System", row.Source);
            Assert.True(row.IsReadOnly);
            Assert.True(row.IsRequired);
            Assert.Equal("Vendor", row.ObjectLabel);
            Assert.StartsWith("system:vendor:", row.Id);
        });
    }

    [Fact]
    public void BuildCatalogRows_CustomObjectStoredField_UsesObjectNameAsLabel()
    {
        // A stored custom field on a custom object (ObjectType = slug) shows the object's Name in the
        // OBJECT column, not the raw slug.
        var rows = FieldSchemaService.BuildCatalogRows(
            new[] { Stored("vendor", "rating") },
            Array.Empty<CatalogFieldSpec>(),
            new[] { ("vendor", "Vendor") });

        var row = Assert.Single(rows, candidate => candidate.FieldKey == "rating");
        Assert.Equal("vendor", row.ObjectType);
        Assert.Equal("Vendor", row.ObjectLabel);
        Assert.Equal("User", row.Source);
    }

    // ─── BuildPlatformCatalogRows (Slice B1 — Platform Fields catalog) ──────────────────────────

    private static PlatformFieldRow Platform(
        string key, string display, string type = "Text", string category = "Platform", bool immutable = false) => new()
    {
        PlatformFieldId = Guid.NewGuid(),
        FieldKey = key,
        DisplayName = display,
        FieldType = type,
        Category = category,
        IsSystemImmutable = immutable,
        HasManualWritePath = true,
        SelectOptionsJson = null,
    };

    [Fact]
    public void BuildPlatformCatalogRows_SynthesisesSystemFieldsForGlobalObjectsOnly()
    {
        // Act
        var rows = FieldSchemaService.BuildPlatformCatalogRows(
            Array.Empty<FieldCatalogRow>(), Array.Empty<PlatformFieldRow>());

        // Assert — only the two Global objects (Request, Task) × five system auto-fields = 10 rows.
        var systemRows = rows.Where(row => row.Source == "System").ToList();
        Assert.Equal(10, systemRows.Count);
        Assert.All(systemRows, row =>
        {
            Assert.True(row.IsReadOnly);
            Assert.Equal("Global", row.Location);
            Assert.Contains(row.ObjectType, new[] { "Request", "Task" });
        });
        Assert.DoesNotContain(rows, row => row.ObjectType is "Attachment" or "Feature" or "ToolkitItem");
    }

    [Fact]
    public void BuildPlatformCatalogRows_PlatformDefined_NonSystemOnRequestSystemSuppressed()
    {
        // Arrange — a System-category entry (record-id) must not duplicate the synthesised system rows;
        // the Platform/Derived entries surface on Request, editable unless immutable.
        var platformDefined = new[]
        {
            Platform("record-id", "Record ID", category: "System", immutable: true),      // suppressed
            Platform("origin", "Origin", type: "Lookup", category: "Derived", immutable: true), // read-only
            Platform("legacy-id", "Legacy ID", type: "Text", immutable: false),           // editable
            Platform("ai-solutions-status", "AI Solutions Status", type: "Select", immutable: false),
        };

        // Act
        var rows = FieldSchemaService.BuildPlatformCatalogRows(Array.Empty<FieldCatalogRow>(), platformDefined);

        // Assert
        Assert.DoesNotContain(rows, row => row.Source == "Platform" && row.FieldKey == "record-id");

        var legacy = Assert.Single(rows, row => row.FieldKey == "legacy-id");
        Assert.Equal("Platform", legacy.Source);
        Assert.Equal("Request", legacy.ObjectType);
        Assert.False(legacy.IsReadOnly);

        var origin = Assert.Single(rows, row => row.FieldKey == "origin");
        Assert.Equal("Platform", origin.Source);
        Assert.True(origin.IsReadOnly);

        var status = Assert.Single(rows, row => row.FieldKey == "ai-solutions-status");
        Assert.Equal("SingleSelect", status.FieldType); // Select → SingleSelect
    }

    [Fact]
    public void BuildPlatformCatalogRows_GlobalField_IsReadOnlyUserRow()
    {
        var rows = FieldSchemaService.BuildPlatformCatalogRows(
            new[] { Stored("Task", "sharedField", location: "Global", isLocal: false) },
            Array.Empty<PlatformFieldRow>());

        var row = Assert.Single(rows, candidate => candidate.FieldKey == "sharedField");
        Assert.Equal("User", row.Source);
        Assert.Equal("Task", row.ObjectType);
        Assert.True(row.IsReadOnly);
    }

    [Fact]
    public void BuildPlatformCatalogRows_GlobalCollidingWithPlatformOnRequest_ResolvesToPlatform()
    {
        // A Global field sharing a key with a platform-defined field on Request de-dupes to one row.
        var rows = FieldSchemaService.BuildPlatformCatalogRows(
            new[] { Stored("Request", "legacy-id", location: "Global") },
            new[] { Platform("legacy-id", "Legacy ID") });

        var legacyRows = rows.Where(row => row.ObjectType == "Request" && row.FieldKey == "legacy-id").ToList();
        Assert.Single(legacyRows);
        Assert.Equal("Platform", legacyRows[0].Source);
    }

    [Fact]
    public void BuildPlatformCatalogRows_GlobalKeyCollidingWithSystemAutoField_IsSkipped()
    {
        // A Global 'name' field must fold into the synthesised system row, not duplicate it.
        var rows = FieldSchemaService.BuildPlatformCatalogRows(
            new[] { Stored("Request", "name", location: "Global") },
            Array.Empty<PlatformFieldRow>());

        var nameRows = rows.Where(row => row.ObjectType == "Request" && row.FieldKey == "name").ToList();
        Assert.Single(nameRows);
        Assert.Equal("System", nameRows[0].Source);
    }
}
