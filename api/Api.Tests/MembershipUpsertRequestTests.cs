// Unit tests for the MembershipUpsertRequest self-validation (S29). The IValidatableObject rule
// enforces "exactly one of userId / email" — the framework runs it on [ApiController] binding, so it
// is tested directly here (api-testing-guidelines.md — every validation rule and every branch).

using System.ComponentModel.DataAnnotations;
using McDermott.AiTracker.Api.Modules.Users;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class MembershipUpsertRequestTests
{
    private static IReadOnlyList<ValidationResult> Validate(MembershipUpsertRequest request) =>
        request.Validate(new ValidationContext(request)).ToList();

    [Fact]
    public void Validate_EmailOnly_IsValid()
    {
        // Arrange
        var sut = new MembershipUpsertRequest { Email = "a@example.com", Level = "Member" };

        // Act
        var results = Validate(sut);

        // Assert
        Assert.Empty(results);
    }

    [Fact]
    public void Validate_UserIdOnly_IsValid()
    {
        // Arrange
        var sut = new MembershipUpsertRequest { UserId = Guid.NewGuid(), Level = "Viewer" };

        // Act
        var results = Validate(sut);

        // Assert
        Assert.Empty(results);
    }

    [Fact]
    public void Validate_BothUserIdAndEmail_IsInvalid()
    {
        // Arrange
        var sut = new MembershipUpsertRequest { UserId = Guid.NewGuid(), Email = "a@example.com", Level = "Member" };

        // Act
        var results = Validate(sut);

        // Assert
        Assert.NotEmpty(results);
    }

    [Fact]
    public void Validate_Neither_IsInvalid()
    {
        // Arrange
        var sut = new MembershipUpsertRequest { Level = "Member" };

        // Act
        var results = Validate(sut);

        // Assert
        Assert.NotEmpty(results);
    }
}
