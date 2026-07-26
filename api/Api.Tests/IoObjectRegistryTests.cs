using McDermott.AiTracker.Api.Modules.ImportExport;
using McDermott.AiTracker.Api.Modules.Objects;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class IoObjectRegistryTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private static IIoObject Stub(string objectType)
    {
        var mock = new Mock<IIoObject>();
        mock.SetupGet(item => item.ObjectType).Returns(objectType);
        return mock.Object;
    }

    private static ObjectDefinitionDto Def(string slug, bool isSystem) =>
        new(Guid.NewGuid(), WorkspaceId, slug, slug, slug, "LocalWorkspace", null, true, null, 0, 0, isSystem);

    private static IoObjectRegistry Build(
        IEnumerable<IIoObject> builtIns,
        Mock<IObjectSchemaService>? objects = null,
        Mock<ICustomObjectIoObjectFactory>? factory = null) =>
        new(builtIns, (objects ?? new Mock<IObjectSchemaService>()).Object, (factory ?? new Mock<ICustomObjectIoObjectFactory>()).Object);

    [Fact]
    public void Find_ResolvesRegisteredType()
    {
        var registry = Build(new[] { Stub("Request"), Stub("Feature") });

        Assert.Equal("Request", registry.Find("Request")!.ObjectType);
        Assert.Equal("Feature", registry.Find("Feature")!.ObjectType);
    }

    [Fact]
    public void Find_UnknownOrNull_ReturnsNull()
    {
        var registry = Build(new[] { Stub("Request") });

        Assert.Null(registry.Find("Widget"));
        Assert.Null(registry.Find(null));
        Assert.Null(registry.Find("request"));
    }

    [Fact]
    public void All_PreservesRegistrationOrder()
    {
        var registry = Build(new[] { Stub("Request"), Stub("Feature"), Stub("Task") });

        Assert.Equal(new[] { "Request", "Feature", "Task" }, registry.All.Select(item => item.ObjectType));
    }

    [Fact]
    public async Task FindForWorkspaceAsync_BuiltIn_DoesNotHitFactory()
    {
        var objects = new Mock<IObjectSchemaService>();
        var factory = new Mock<ICustomObjectIoObjectFactory>();
        var registry = Build(new[] { Stub("Request") }, objects, factory);

        var result = await registry.FindForWorkspaceAsync(WorkspaceId, "Request", Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Request", result!.ObjectType);
        objects.Verify(o => o.ListAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task FindForWorkspaceAsync_CustomSlug_BuildsViaFactory()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects
            .Setup(o => o.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Def("Request", isSystem: true), Def("vendor", isSystem: false) });
        var factory = new Mock<ICustomObjectIoObjectFactory>();
        factory
            .Setup(f => f.CreateAsync(WorkspaceId, It.Is<ObjectDefinitionDto>(d => d.ObjectKey == "vendor"), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Stub("vendor"));
        var registry = Build(new[] { Stub("Request") }, objects, factory);

        var result = await registry.FindForWorkspaceAsync(WorkspaceId, "vendor", Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("vendor", result!.ObjectType);
    }

    [Fact]
    public async Task FindForWorkspaceAsync_UnknownSlug_ReturnsNull()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects
            .Setup(o => o.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Def("vendor", isSystem: false) });
        var registry = Build(new[] { Stub("Request") }, objects);

        Assert.Null(await registry.FindForWorkspaceAsync(WorkspaceId, "ghost", Guid.NewGuid(), CancellationToken.None));
        Assert.Null(await registry.FindForWorkspaceAsync(WorkspaceId, null, Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task AllForWorkspaceAsync_ReturnsBuiltInsPlusCustom()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects
            .Setup(o => o.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Def("Request", isSystem: true), Def("vendor", isSystem: false) });
        var factory = new Mock<ICustomObjectIoObjectFactory>();
        factory
            .Setup(f => f.CreateAsync(WorkspaceId, It.IsAny<ObjectDefinitionDto>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Stub("vendor"));
        var registry = Build(new[] { Stub("Request"), Stub("Feature") }, objects, factory);

        var all = await registry.AllForWorkspaceAsync(WorkspaceId, Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(new[] { "Request", "Feature", "vendor" }, all.Select(i => i.ObjectType));
    }
}
