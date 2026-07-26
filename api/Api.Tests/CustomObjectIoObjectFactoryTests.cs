using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Objects;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CustomObjectIoObjectFactoryTests
{
    private static readonly Guid ObjectId = Guid.Parse("cccccccc-0000-4000-8000-000000000009");
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private static ObjectDefinitionDto Definition(string slug = "vendor", string? plural = "Vendors") =>
        new(ObjectId, WorkspaceId, slug, "Vendor", plural, "LocalWorkspace", null, true, null, 0, 0, IsSystem: false);

    private static FieldDefinitionDto Field(string key, string display, bool required = false, bool retired = false) =>
        new(Guid.NewGuid(), WorkspaceId, "vendor", key, display, "text", "content", null, null,
            required, false, false, false, "LocalWorkspace", true, null, null, null, null, null, false, 0, retired,
            Array.Empty<SelectOptionDto>(), Array.Empty<FieldRuleDto>(), null, default, default);

    private static CustomObjectIoObjectFactory BuildFactory(params FieldDefinitionDto[] fields)
    {
        var schema = new Mock<IFieldSchemaService>();
        schema
            .Setup(s => s.GetSchemaAsync(WorkspaceId, "vendor", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new WorkspaceFieldSchemaDto(WorkspaceId, "vendor", fields, Array.Empty<PlatformFieldDto>()));
        var options = Options.Create(new ImportExportOptions { MaxExportRows = 5000 });
        return new CustomObjectIoObjectFactory(new Mock<ICustomRecordsService>().Object, schema.Object, options);
    }

    [Fact]
    public async Task CreateAsync_BuildsDescriptor_WithSlugPluralAndFieldColumns()
    {
        var factory = BuildFactory(Field("vendorName", "Vendor name", required: true), Field("seatCount", "Seats"));

        var io = await factory.CreateAsync(WorkspaceId, Definition(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("vendor", io.ObjectType);
        Assert.Equal("Vendors", io.Label);
        Assert.True(io.CanImport);
        Assert.True(io.CanExport);
        var exportFields = await io.GetExportFieldsAsync(WorkspaceId, Guid.NewGuid(), CancellationToken.None);
        Assert.Equal(new[] { "id", "name", "vendorName", "seatCount" }, exportFields.Select(f => f.Key));
        Assert.Equal(new[] { "name", "vendorName", "seatCount" }, io.ImportFields.Select(f => f.Key));
        Assert.True(io.ImportFields.Single(f => f.Key == "name").Required);
        Assert.True(io.ImportFields.Single(f => f.Key == "vendorName").Required);
    }

    [Fact]
    public async Task CreateAsync_ExcludesRetiredFields_AndIdentityKeyedUserFields()
    {
        var factory = BuildFactory(
            Field("vendorName", "Vendor name"),
            Field("oldField", "Old", retired: true),
            Field("name", "Name clash"), // a user field keyed "name" — excluded (first-class column wins)
            Field("id", "Id clash"));     // a user field keyed "id" — excluded

        var io = await factory.CreateAsync(WorkspaceId, Definition(), Guid.NewGuid(), CancellationToken.None);

        var exportKeys = (await io.GetExportFieldsAsync(WorkspaceId, Guid.NewGuid(), CancellationToken.None)).Select(f => f.Key);
        Assert.Equal(new[] { "id", "name", "vendorName" }, exportKeys);
        Assert.DoesNotContain("oldField", io.ImportFields.Select(f => f.Key));
    }

    [Fact]
    public async Task CreateAsync_NullPluralLabel_FallsBackToName()
    {
        var factory = BuildFactory(Field("vendorName", "Vendor name"));

        var io = await factory.CreateAsync(WorkspaceId, Definition(plural: null), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Vendor", io.Label);
    }
}
