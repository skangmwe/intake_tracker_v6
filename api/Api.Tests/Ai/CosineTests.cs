using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class CosineTests
{
    [Fact]
    public void Similarity_SameDirection_IsOne()
    {
        // Act
        var similarity = Cosine.Similarity(new[] { 1f, 0f }, new[] { 1f, 0f });

        // Assert
        Assert.Equal(1d, similarity, precision: 6);
    }

    [Fact]
    public void Similarity_Orthogonal_IsZero()
    {
        // Act
        var similarity = Cosine.Similarity(new[] { 1f, 0f }, new[] { 0f, 1f });

        // Assert
        Assert.Equal(0d, similarity, precision: 6);
    }

    [Fact]
    public void Similarity_OppositeDirection_IsMinusOne()
    {
        // Act
        var similarity = Cosine.Similarity(new[] { 1f, 0f }, new[] { -1f, 0f });

        // Assert
        Assert.Equal(-1d, similarity, precision: 6);
    }

    [Fact]
    public void Similarity_ZeroNormVector_IsZero()
    {
        // Act - a zero vector has no direction; guard against divide-by-zero → 0.
        var similarity = Cosine.Similarity(new[] { 0f, 0f }, new[] { 1f, 1f });

        // Assert
        Assert.Equal(0d, similarity, precision: 6);
    }

    [Fact]
    public void Similarity_DimensionMismatch_IsZero()
    {
        // Act - mismatched dimensions can only be a bug; return 0 rather than throw.
        var similarity = Cosine.Similarity(new[] { 1f, 0f }, new[] { 1f, 0f, 0f });

        // Assert
        Assert.Equal(0d, similarity, precision: 6);
    }
}
