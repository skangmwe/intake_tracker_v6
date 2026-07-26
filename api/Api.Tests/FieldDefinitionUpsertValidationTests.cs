// Model-validation tests for FieldDefinitionUpsertRequest.ObjectType (SP3b Slice 2a, Task 4 — the
// carried-forward Task 3 review finding). The regex was widened to admit a custom object slug
// alongside the five named built-ins, mirroring the identical fix already applied to
// SavedViewUpsertRequest.ObjectType (see SavedViewUpsertValidationTests.cs). Before this fix, a
// custom-object slug (e.g. a Global custom object's ObjectKey, passed to the platform field
// endpoints added in this task, or a workspace custom object's ObjectKey via FieldsController)
// failed model binding with a 400 before the controller action — and therefore before
// FieldSchemaService's own existence check — ever ran. Slug *validity* (does it resolve to a real
// object) is app-enforced downstream, not checked here — a request with an unresolvable slug still
// binds successfully and then 404s from the service.

using System.ComponentModel.DataAnnotations;
using McDermott.AiTracker.Api.Modules.Fields;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FieldDefinitionUpsertValidationTests
{
    private static IList<ValidationResult> Validate(FieldDefinitionUpsertRequest request)
    {
        var context = new ValidationContext(request);
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(request, context, results, validateAllProperties: true);
        return results;
    }

    private static FieldDefinitionUpsertRequest Request(string? objectType) => new()
    {
        ObjectType = objectType,
        FieldKey = "priority",
        DisplayName = "Priority",
        FieldType = "ShortText",
        Category = "WorkspaceLocal",
    };

    [Theory]
    [InlineData("Request")]
    [InlineData("Task")]
    [InlineData("Feature")]
    [InlineData("ToolkitItem")]
    [InlineData("Attachment")]
    public void ObjectType_BuiltIn_IsValid(string builtIn)
    {
        var results = Validate(Request(builtIn));

        Assert.DoesNotContain(results, result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_CustomSlug_IsValid()
    {
        // The Global custom object slug that the platform field endpoints (Task 4) pass through as
        // ObjectType — this is the exact scenario that was silently broken before the fix.
        var results = Validate(Request("vendor"));

        Assert.DoesNotContain(results, result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_CustomSlugWithHyphenAndDigits_IsValid()
    {
        var results = Validate(Request("vendor-review-2"));

        Assert.DoesNotContain(results, result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_Null_IsInvalid()
    {
        var results = Validate(Request(null));

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_Empty_IsInvalid()
    {
        var results = Validate(Request(""));

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_MalformedSlug_IsInvalid()
    {
        // Upper-case / spaces / punctuation are not a valid slug and not a named built-in.
        var results = Validate(Request("Bad Slug!"));

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));
    }
}
