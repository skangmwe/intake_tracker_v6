// Model-validation tests for FieldDefinitionUpsertRequest.ObjectType (SP3b Slice 2a, Task 4 — the
// carried-forward Task 3 review finding, revised after fix-round-1 review). ObjectType carries no
// [RegularExpression] — only [Required] + [MaxLength(64)] (matching ObjectDefinition.ObjectKey's
// column width). An earlier version of this fix widened the built-ins-only regex to also admit a
// "clean" slug shape ([a-z0-9][a-z0-9-]{0,63}), mirroring SavedViewUpsertRequest.ObjectType (Slice A
// / Task A6, see SavedViewUpsertValidationTests.cs) — but that still rejected slugs the generator can
// actually produce outside that shape: usp_UpsertObjectDefinition.sql's REPLACE chain never strips
// apostrophes or other punctuation/non-ASCII, so e.g. a Global object named "O'Brien Vendors" yields
// the ObjectKey "o'brien-vendors", which a charset regex would still 400 at model binding — before
// the controller action, and therefore before FieldSchemaService's own existence check, ever runs.
// We do not own the slug generator (shipped Slice-1 code) and no regex can safely track its full
// charset, so binding no longer attempts to enumerate valid object types at all. Slug *validity*
// (does it resolve to a real object) is enforced downstream — FieldsController.ResolveObjectTypeAsync
// (workspace path) / FieldSchemaService.UpsertGlobalObjectFieldAsync/RetireGlobalObjectFieldAsync
// (platform path) — not here: a bogus-but-well-formed value binds successfully and then 404s from the
// service, which is correct.
//
// NOTE: SavedViewUpsertRequest.ObjectType has the identical latent issue (same charset-regex
// approach, same generator) and is a known sibling for a future slice — intentionally left unchanged
// here, out of scope for this task.

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

    private static bool HasObjectTypeError(IList<ValidationResult> results) =>
        results.Any(result => result.MemberNames.Contains(nameof(FieldDefinitionUpsertRequest.ObjectType)));

    [Theory]
    [InlineData("Request")]
    [InlineData("Task")]
    [InlineData("Feature")]
    [InlineData("ToolkitItem")]
    [InlineData("Attachment")]
    public void ObjectType_BuiltIn_IsValid(string builtIn)
    {
        var results = Validate(Request(builtIn));

        Assert.False(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_CustomSlug_IsValid()
    {
        // The Global custom object slug that the platform field endpoints (Task 4) pass through as
        // ObjectType — this is the exact scenario that was silently broken before the fix.
        var results = Validate(Request("vendor"));

        Assert.False(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_CustomSlugWithHyphenAndDigits_IsValid()
    {
        var results = Validate(Request("vendor-review-2"));

        Assert.False(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_SlugWithApostrophe_IsValid()
    {
        // usp_UpsertObjectDefinition.sql's separator REPLACE chain never strips apostrophes, so a
        // Global object named "O'Brien Vendors" produces exactly this ObjectKey. This is the fix-
        // round-1 finding: a charset-enumerating regex would 400 this at model binding even though
        // it is a real, generator-produced slug. It must bind — the service layer decides validity.
        var results = Validate(Request("o'brien-vendors"));

        Assert.False(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_SlugWithOtherPunctuation_IsValid()
    {
        // Any other punctuation the generator's REPLACE chain doesn't strip (it only handles
        // space/tab/CR/LF/_//&) must also bind — no charset is enumerated at all.
        var results = Validate(Request("vendor.co,inc"));

        Assert.False(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_Null_IsInvalid()
    {
        var results = Validate(Request(null));

        Assert.True(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_Empty_IsInvalid()
    {
        var results = Validate(Request(""));

        Assert.True(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_ExceedsMaxLength_IsInvalid()
    {
        // MaxLength(64) is the one shape constraint left on ObjectType — matches the
        // ObjectDefinition.ObjectKey column width (NVARCHAR(64)).
        var results = Validate(Request(new string('a', 65)));

        Assert.True(HasObjectTypeError(results));
    }

    [Fact]
    public void ObjectType_AtMaxLength_IsValid()
    {
        var results = Validate(Request(new string('a', 64)));

        Assert.False(HasObjectTypeError(results));
    }
}
