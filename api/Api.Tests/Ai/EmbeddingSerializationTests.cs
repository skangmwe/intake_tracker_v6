using McDermott.AiTracker.Api.Modules.Ai.Providers;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class EmbeddingSerializationTests
{
    [Fact]
    public void ToBytes_ThenFromBytes_RoundTripsVector()
    {
        // Arrange
        var vector = new[] { 0.1f, -0.2f, 3.14f, 0f, float.MaxValue, float.MinValue };

        // Act
        var roundTripped = EmbeddingBytes.FromBytes(EmbeddingBytes.ToBytes(vector));

        // Assert
        Assert.Equal(vector, roundTripped);
    }

    [Fact]
    public void ToBytes_ProducesFourBytesPerFloat()
    {
        // Arrange
        var vector = new[] { 1f, 2f, 3f };

        // Act
        var bytes = EmbeddingBytes.ToBytes(vector);

        // Assert
        Assert.Equal(vector.Length * sizeof(float), bytes.Length);
    }

    [Fact]
    public void FromBytes_EmptyArray_ReturnsEmptyVector()
    {
        // Act
        var vector = EmbeddingBytes.FromBytes(Array.Empty<byte>());

        // Assert
        Assert.Empty(vector);
    }
}
