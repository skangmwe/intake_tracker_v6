// Unit tests for LifecycleService's pure helpers — validation, payload serialization, and the
// flat-reads -> nested-config assembly. These need no database (the DB-backed reads/writes are
// covered by tSQLt + integration tests). api-testing-guidelines.md.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Lifecycle;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class LifecycleServiceTests
{
    private static LifecycleConfigUpdateRequest RequestWith(params LifecycleUpsertInput[] lifecycles) =>
        new() { Lifecycles = lifecycles };

    private static LifecycleUpsertInput StandardLifecycle(bool isDefault = true) => new()
    {
        Name = "Standard",
        RequestType = "Full build",
        IsDefault = isDefault,
        SortOrder = 0,
        Stages = new[]
        {
            new StageUpsertInput { Key = "build", Label = "Build", StatusCategory = "Build", SortOrder = 0 },
            new StageUpsertInput { Key = "qa", Label = "QA", StatusCategory = "Review", SortOrder = 1 },
        },
        Gates = new[]
        {
            new GateUpsertInput
            {
                Name = "QA readiness gate", FromStageKey = "build", ToStageKey = "qa", SortOrder = 0,
                Slots = new[] { new GateSlotUpsertInput { RoleLabel = "InfoSec" } },
            },
        },
    };

    [Fact]
    public void ValidateConfig_ValidPayload_NoErrors()
    {
        // Arrange
        var request = RequestWith(StandardLifecycle());

        // Act
        var errors = LifecycleService.ValidateConfig(request);

        // Assert
        Assert.Empty(errors);
    }

    [Fact]
    public void ValidateConfig_NoLifecycles_ReportsRequired()
    {
        // Arrange
        var request = RequestWith();

        // Act
        var errors = LifecycleService.ValidateConfig(request);

        // Assert
        Assert.Contains(errors, error => error.Contains("At least one lifecycle", StringComparison.Ordinal));
    }

    [Fact]
    public void ValidateConfig_NoDefault_ReportsExactlyOne()
    {
        // Arrange
        var request = RequestWith(StandardLifecycle(isDefault: false));

        // Act
        var errors = LifecycleService.ValidateConfig(request);

        // Assert
        Assert.Contains(errors, error => error.Contains("exactly one", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateConfig_MultipleDefaults_ReportsExactlyOne()
    {
        // Arrange
        var request = RequestWith(StandardLifecycle(), StandardLifecycle());

        // Act
        var errors = LifecycleService.ValidateConfig(request);

        // Assert
        Assert.Contains(errors, error => error.Contains("exactly one", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ValidateConfig_GateReferencesForeignStage_Reports()
    {
        // Arrange
        var lifecycle = StandardLifecycle();
        lifecycle.Gates = new[]
        {
            new GateUpsertInput { Name = "Bad gate", FromStageKey = "build", ToStageKey = "nope", SortOrder = 0 },
        };
        var request = RequestWith(lifecycle);

        // Act
        var errors = LifecycleService.ValidateConfig(request);

        // Assert
        Assert.Contains(errors, error => error.Contains("not part of", StringComparison.Ordinal));
    }

    [Fact]
    public void ValidateConfig_DuplicateStageKeys_Reports()
    {
        // Arrange
        var lifecycle = StandardLifecycle();
        lifecycle.Stages = new[]
        {
            new StageUpsertInput { Key = "build", Label = "Build", StatusCategory = "Build", SortOrder = 0 },
            new StageUpsertInput { Key = "build", Label = "Build again", StatusCategory = "Build", SortOrder = 1 },
        };
        lifecycle.Gates = Array.Empty<GateUpsertInput>();
        var request = RequestWith(lifecycle);

        // Act
        var errors = LifecycleService.ValidateConfig(request);

        // Assert
        Assert.Contains(errors, error => error.Contains("more than one stage with the key", StringComparison.Ordinal));
    }

    [Fact]
    public void SerializeLifecycles_EmitsNestedShapeTheProcExpects()
    {
        // Arrange
        var request = RequestWith(StandardLifecycle());

        // Act
        var json = LifecycleService.SerializeLifecycles(request);
        using var document = JsonDocument.Parse(json);

        // Assert — nested lifecycle -> stages -> gates -> slots, camelCase keys.
        var lifecycle = Assert.Single(document.RootElement.EnumerateArray());
        Assert.Equal("Standard", lifecycle.GetProperty("name").GetString());
        Assert.True(lifecycle.GetProperty("isDefault").GetBoolean());
        Assert.Equal(2, lifecycle.GetProperty("stages").GetArrayLength());
        var gate = Assert.Single(lifecycle.GetProperty("gates").EnumerateArray());
        Assert.Equal("build", gate.GetProperty("fromStageKey").GetString());
        Assert.Equal("InfoSec", gate.GetProperty("slots")[0].GetProperty("roleLabel").GetString());
    }

    [Fact]
    public void AssembleConfig_GroupsStagesGatesSlotsPerLifecycle()
    {
        // Arrange
        var workspaceId = Guid.NewGuid();
        var lifecycleId = Guid.NewGuid();
        var buildStageId = Guid.NewGuid();
        var qaStageId = Guid.NewGuid();
        var gateId = Guid.NewGuid();

        var lifecycles = new[] { new LifecycleRow { LifecycleId = lifecycleId, Name = "Standard", RequestType = "Full build", IsDefault = true, SortOrder = 0 } };
        var stages = new[]
        {
            new StageDefinitionRow { StageDefinitionId = buildStageId, LifecycleId = lifecycleId, StageKey = "build", Label = "Build", StatusCategory = "Build", SortOrder = 0 },
            new StageDefinitionRow { StageDefinitionId = qaStageId, LifecycleId = lifecycleId, StageKey = "qa", Label = "QA", StatusCategory = "Review", SortOrder = 1 },
        };
        var gates = new[] { new GateDefinitionRow { GateDefinitionId = gateId, LifecycleId = lifecycleId, Name = "QA gate", FromStageId = buildStageId, ToStageId = qaStageId, JoinKind = "and", SortOrder = 0 } };
        var slots = new[] { new GateSlotRow { GateDefinitionId = gateId, RoleLabel = "InfoSec", SlotIndex = 0, EligibleCount = 2 } };
        var roleLabels = new[] { new RoleLabelRow { RoleLabelId = Guid.NewGuid(), Label = "InfoSec", SortOrder = 0 } };
        var members = Array.Empty<ApproverTeamMemberRow>();

        // Act
        var config = LifecycleService.AssembleConfig(workspaceId, lifecycles, stages, gates, slots, roleLabels, members);

        // Assert
        var lifecycle = Assert.Single(config.Lifecycles);
        Assert.Equal(2, lifecycle.Stages.Count);
        var gate = Assert.Single(lifecycle.Gates);
        Assert.Equal(buildStageId, gate.FromStageId);
        var slot = Assert.Single(gate.Slots);
        Assert.Equal(2, slot.EligibleCount);
        // Every catalog role surfaces as an approver team, even with no members.
        var team = Assert.Single(config.ApproverTeams);
        Assert.Equal("InfoSec", team.RoleLabel);
        Assert.Empty(team.Members);
    }

    [Fact]
    public void BuildApproverTeams_SurfacesRetiredLabelWithLiveMembers()
    {
        // Arrange — a member still sits under a role label that is no longer in the catalog.
        var roleLabels = new[] { new RoleLabelRow { RoleLabelId = Guid.NewGuid(), Label = "InfoSec", SortOrder = 0 } };
        var members = new[]
        {
            new ApproverTeamMemberRow { RoleLabel = "GCO", UserId = Guid.NewGuid(), DisplayName = "R. Osei" },
        };

        // Act
        var teams = LifecycleService.BuildApproverTeams(roleLabels, members);

        // Assert — catalog label first (empty), then the retired label carrying its member.
        Assert.Equal(2, teams.Count);
        Assert.Equal("InfoSec", teams[0].RoleLabel);
        Assert.Empty(teams[0].Members);
        Assert.Equal("GCO", teams[1].RoleLabel);
        Assert.Single(teams[1].Members);
    }
}
