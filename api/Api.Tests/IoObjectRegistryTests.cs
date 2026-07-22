// Unit tests for IoObjectRegistry (S28 wizards) — the thin lookup over the registered object
// descriptors. Verifies Find resolves by object type (case-sensitive) and returns null for unknown
// types, and that All preserves registration order.

using McDermott.AiTracker.Api.Modules.ImportExport;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class IoObjectRegistryTests
{
    private static IIoObject Stub(string objectType)
    {
        var mock = new Mock<IIoObject>();
        mock.SetupGet(item => item.ObjectType).Returns(objectType);
        return mock.Object;
    }

    [Fact]
    public void Find_ResolvesRegisteredType()
    {
        var registry = new IoObjectRegistry(new[] { Stub("Request"), Stub("Feature") });

        Assert.Equal("Request", registry.Find("Request")!.ObjectType);
        Assert.Equal("Feature", registry.Find("Feature")!.ObjectType);
    }

    [Fact]
    public void Find_UnknownOrNull_ReturnsNull()
    {
        var registry = new IoObjectRegistry(new[] { Stub("Request") });

        Assert.Null(registry.Find("Widget"));
        Assert.Null(registry.Find(null));
        // Case-sensitive — the object type keys are exact machine keys.
        Assert.Null(registry.Find("request"));
    }

    [Fact]
    public void All_PreservesRegistrationOrder()
    {
        var registry = new IoObjectRegistry(new[] { Stub("Request"), Stub("Feature"), Stub("Task") });

        Assert.Equal(new[] { "Request", "Feature", "Task" }, registry.All.Select(item => item.ObjectType));
    }
}
