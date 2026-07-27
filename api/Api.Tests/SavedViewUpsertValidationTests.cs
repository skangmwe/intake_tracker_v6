// Model-validation tests for SavedViewUpsertRequest.ObjectType. The enumerating regex was dropped in
// favour of [MaxLength(64)] (mirroring FieldDefinitionUpsertRequest.ObjectType): the ObjectKey slug
// generator can emit apostrophes/punctuation (e.g. "O'Brien Vendors" -> "o'brien-vendors") that a
// charset regex would wrongly reject, so only length is bounded here — validity is app-enforced.

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
    public void ObjectType_PunctuationSlug_IsValid()
    {
        // The ObjectKey generator keeps apostrophes/punctuation (only whitespace/_/&/ become '-'), so a
        // slug like "o'brien-vendors" is legitimate. The old enumerating regex 400'd it — the fix accepts it.
        var results = Validate(Request("o'brien-vendors"));

        Assert.DoesNotContain(results, result => result.MemberNames.Contains(nameof(SavedViewUpsertRequest.ObjectType)));
    }

    [Fact]
    public void ObjectType_TooLong_IsInvalid()
    {
        // Length is still bounded to the SavedView.ObjectType column width (64).
        var results = Validate(Request(new string('a', 65)));

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(SavedViewUpsertRequest.ObjectType)));
    }
}
