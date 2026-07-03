# API unit tests — templates and required cases

Companion to `/dev-unit-test-and-remediate` for `.cs` source files. Used in tandem with `.claude/rules/dev/api-testing-guidelines.md`, which is the canonical source for naming, conventions, and the always-test list.

This file holds: the unit-vs-integration decision, the xUnit/Moq scaffolding template, the required-case checklist that drives "test exists but is missing required cases" detection, and a short list of common mechanical fixes.

---

## Decide test type for the in-scope file

| File pattern | Default test type |
|---|---|
| `Services/*.cs`, `Validators/*.cs`, `Mappers/*.cs`, `Helpers/*.cs` | **Unit** (this skill) |
| `Controllers/*.cs`, `Workers/*.cs`, `Functions/*.cs`, `Endpoints/*.cs` | **Integration** — out of scope; surface a finding noting that integration coverage is needed but do not scaffold integration tests in this skill |
| `Models/*.cs`, DTOs, records with no logic | Skip — no branchable behaviour |
| `Program.cs`, `Startup.cs`, `appsettings*.json`, `Dockerfile` | Skip — config / composition |

---

## Test file conventions

- Test project: `<ServiceProject>.Tests` next to `<ServiceProject>`.
- Test file: `<ClassName>Tests.cs` mirroring the source folder structure.
- Test class: `public class <ClassName>Tests` (no namespace nesting beyond the project default).
- Test method: `<MethodUnderTest>_<Scenario>_<ExpectedResult>` (per `api-testing-guidelines.md`).

If a `<ClassName>Tests.cs` already exists, **extend** it. Never replace.

---

## Scaffolding template (xUnit + Moq)

```csharp
using Moq;
using Xunit;

namespace {{Project}}.Tests.{{Folder}};

public class {{ClassName}}Tests
{
    private readonly Mock<I{{Dependency1}}> _{{dep1}} = new();
    private readonly Mock<I{{Dependency2}}> _{{dep2}} = new();

    private {{ClassName}} CreateSut() =>
        new {{ClassName}}(_{{dep1}}.Object, _{{dep2}}.Object);

    [Fact]
    public async Task {{Method}}_HappyPath_ReturnsExpected()
    {
        // Arrange
        _{{dep1}}.Setup(x => x.{{Call}}(It.IsAny<{{ArgType}}>()))
                 .ReturnsAsync({{validResult}});
        var sut = CreateSut();

        // Act
        var result = await sut.{{Method}}({{validInput}});

        // Assert
        Assert.Equal({{expected}}, result);
        _{{dep1}}.Verify(x => x.{{Call}}({{expectedArg}}), Times.Once);
    }

    [Fact]
    public async Task {{Method}}_PermanentFailure_DoesNotRetry()
    {
        _{{dep1}}.Setup(x => x.{{Call}}(It.IsAny<{{ArgType}}>()))
                 .ThrowsAsync(new HttpRequestException("400"));
        var sut = CreateSut();

        await Assert.ThrowsAsync<HttpRequestException>(() => sut.{{Method}}({{validInput}}));
        _{{dep1}}.Verify(x => x.{{Call}}(It.IsAny<{{ArgType}}>()), Times.Once);
    }

    [Fact]
    public async Task {{Method}}_CancelledToken_ExitsCleanly()
    {
        var cts = new CancellationTokenSource();
        cts.Cancel();
        var sut = CreateSut();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            sut.{{Method}}({{validInput}}, cts.Token));
        _{{dep1}}.Verify(x => x.{{Call}}(It.IsAny<{{ArgType}}>()), Times.Never);
    }
}
```

---

## Required case checklist (drives the "missing required cases" finding)

Per `api-testing-guidelines.md`, every service test class must include:

1. **Happy path** — valid inputs, expected output, dependencies called with the correct arguments.
2. **Permanent failure (4xx)** — a dependency throws once with a non-retryable error; assert no retry and the original exception propagates.
3. **Cancellation** — pass a cancelled `CancellationToken`; assert `OperationCanceledException` and dependencies are not called.

Plus the per-file always-test list (each must be covered if the source contains it):

- Every validation rule and every branch.
- Every boundary value.
- Every error response.
- Duplicate-message handling (for handlers that consume queues).
- Soft-delete exclusion (for any read path that filters `IsDeleted`/`IsActive`).

A test class missing any of the above is a **Mechanical/High** finding — auto-fix by adding the missing case from the template.

---

## Common mechanical fixes (auto-applied)

| Failure / gap | Fix |
|---|---|
| `Mock.Verify` fails because dependency was called with wrong args | Update the `Setup` to match the actual call shape, or update the source to pass the documented args (whichever matches the rule). |
| Test asserts on raw exception type when source throws a wrapped exception | Update assertion to `ThrowsAsync<WrappedException>` and unwrap inner via `ex.InnerException`. |
| Missing `await` on async SUT call → test passes a `Task` to assertion | Add `await`. |
| Test class name not `<Class>Tests` or method name not `<Method>_<Scenario>_<Expected>` | Rename per convention. |
| Boundary case missing for a numeric validator (e.g. `MinLength(3)` without a 2-char test) | Add the boundary case from the always-test list. |
| Soft-delete read path has no `IsDeleted = true` exclusion test | Add the exclusion case. |

---

## When a test surfaces a source bug

If a correctly-written test fails because the source has a real bug, route through `.claude/skills/dev-remediation/api-middletier-remediation-logic.md` (or `api-security-remediation-logic.md` for security-relevant findings) for the source-side fix. Apply, re-read, re-run, log under `remediations-applied/<label>.md`.

---

## Pipeline projects

If the project includes the `document-pipeline` reference, additionally apply `.claude/rules/dev/document-pipeline/api-pipeline-tests.md` for Worker and pipeline-stage test requirements. Pipeline Workers are tested as **integration** in that document, so the same out-of-scope rule applies — surface a finding rather than scaffolding an integration harness here.
