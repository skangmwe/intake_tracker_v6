// Pure-unit tests for WatchersService.HasPreferenceEdit (Slice 26). The helper decides whether
// PatchMineAsync needs to invoke usp_UpsertWatcherPreference for a given patch body — any of the
// five booleans being non-null means "at least one preference edit is present." IsWatching is a
// separate axis (routed through Add/Remove) and must not trigger the preference upsert on its own.

using McDermott.AiTracker.Api.Modules.Watchers;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class WatchersPreferencesTests
{
    [Fact]
    public void HasPreferenceEdit_AllNull_ReturnsFalse()
    {
        // Arrange — a patch that only toggles subscription; no preference edit.
        var request = new WatcherPreferencesPatchRequest { IsWatching = true };

        // Act
        var result = WatchersService.HasPreferenceEdit(request);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void HasPreferenceEdit_GateDecisionsSet_ReturnsTrue()
    {
        var request = new WatcherPreferencesPatchRequest { NotifyGateDecisions = false };
        Assert.True(WatchersService.HasPreferenceEdit(request));
    }

    [Fact]
    public void HasPreferenceEdit_StatusChangesSet_ReturnsTrue()
    {
        var request = new WatcherPreferencesPatchRequest { NotifyStatusChanges = true };
        Assert.True(WatchersService.HasPreferenceEdit(request));
    }

    [Fact]
    public void HasPreferenceEdit_TaskSignoffsSet_ReturnsTrue()
    {
        var request = new WatcherPreferencesPatchRequest { NotifyTaskSignoffs = false };
        Assert.True(WatchersService.HasPreferenceEdit(request));
    }

    [Fact]
    public void HasPreferenceEdit_SlaAndDueDateSet_ReturnsTrue()
    {
        var request = new WatcherPreferencesPatchRequest { NotifySlaAndDueDateReminders = false };
        Assert.True(WatchersService.HasPreferenceEdit(request));
    }

    [Fact]
    public void HasPreferenceEdit_MentionsAndCommentsSet_ReturnsTrue()
    {
        var request = new WatcherPreferencesPatchRequest { NotifyMentionsAndComments = false };
        Assert.True(WatchersService.HasPreferenceEdit(request));
    }

    [Fact]
    public void HasPreferenceEdit_MultiplePreferencesSet_ReturnsTrue()
    {
        // Arrange — realistic Watchers & alerts tab save touching several toggles.
        var request = new WatcherPreferencesPatchRequest
        {
            NotifyGateDecisions = false,
            NotifyStatusChanges = true,
            NotifyMentionsAndComments = false,
        };

        // Act + Assert
        Assert.True(WatchersService.HasPreferenceEdit(request));
    }

    [Fact]
    public void HasPreferenceEdit_EmptyBody_ReturnsFalse()
    {
        // Arrange — a no-op patch (client bug guard).
        var request = new WatcherPreferencesPatchRequest();

        // Act + Assert
        Assert.False(WatchersService.HasPreferenceEdit(request));
    }
}
