// Model-validation tests for SavedViewUpsertRequest.ObjectType (Slice A / Task A6). The regex was
// widened to admit a custom object slug alongside the four named built-ins, so per-object saved views
// work for custom objects. Validity of the slug itself is app-enforced, not checked here.

using System.ComponentModel.DataAnnotations;
using McDermott.AiTracker.Api.Modules.SavedViews;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class SavedViewUpsertValidationTests
{
    private static IList<ValidationResult> Validate(SavedViewUpsertRequest request)
    {
        var context = new ValidationContext(request);
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(request, context, results, validateAllProperties: true);
        return results;
    }

    private static SavedViewUpsertRequest Request(string? objectType) => new()
    {
        ObjectType = objectType,
        Name = "My vendors",
        Scope = "personal",
    };

    [Fact]
    public void ObjectType_CustomSlug_IsValid()
    {
        var results = Validate(Request("vendor"));

        Assert.DoesNotContain(results, result => result.MemberNames.Contains(nameof(SavedViewUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_BuiltIn_IsValid()
    {
        var results = Validate(Request("Request"));

        Assert.DoesNotContain(results, result => result.MemberNames.Contains(nameof(SavedViewUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_Empty_IsInvalid()
    {
        var results = Validate(Request(""));

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(SavedViewUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_MalformedSlug_IsInvalid()
    {
        // Upper-case / spaces / punctuation are not a valid slug and not a named built-in.
        var results = Validate(Request("Bad Slug!"));

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(SavedViewUpsertRequest.ObjectType)));
    }
}
