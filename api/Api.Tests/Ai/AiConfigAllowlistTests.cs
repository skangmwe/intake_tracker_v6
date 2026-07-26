using McDermott.AiTracker.Api.Modules.Ai.Config;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class AiConfigAllowlistTests
{
    [Fact]
    public void Serialize_ThenDeserialize_RoundTrips()
    {
        // Arrange
        var fields = new[] { "Name", "Description" };

        // Act
        var roundTripped = AiContentAllowlist.Deserialize(AiContentAllowlist.Serialize(fields));

        // Assert
        Assert.Equal(fields, roundTripped);
    }

    [Fact]
    public void Deserialize_NullOrBlank_ReturnsEmpty()
    {
        // Act / Assert
        Assert.Empty(AiContentAllowlist.Deserialize(null));
        Assert.Empty(AiContentAllowlist.Deserialize("   "));
    }

    [Fact]
    public void IsValid_SubsetOfAllowed_IsTrue()
    {
        Assert.True(AiContentAllowlist.IsValid(new[] { "Name" }));
        Assert.True(AiContentAllowlist.IsValid(new[] { "Name", "Description", "WorkflowDetails" }));
    }

    [Fact]
    public void IsValid_Empty_IsFalse()
    {
        Assert.False(AiContentAllowlist.IsValid(System.Array.Empty<string>()));
    }

    [Theory]
    [InlineData("ClientNumber")] // client-matter identifier — must never be sendable
    [InlineData("MatterNumber")]
    [InlineData("Requestor")]    // PII identity
    [InlineData("name")]         // wrong case — exact match only
    public void IsValid_FieldOutsideAllowed_IsFalse(string field)
    {
        Assert.False(AiContentAllowlist.IsValid(new[] { "Name", field }));
    }
}
