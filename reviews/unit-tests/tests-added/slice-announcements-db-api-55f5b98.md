# slice-announcements-db-api-55f5b98 — tests added / extended

## Iteration 1

`/dev-build-application` authored the bulk during the slice; this run verified them and rewrote the
tSQLt suite to the reconciled contracts (and to a runnable assertion form — see the note below).

**tSQLt — `database/tests/announcements/test_Announcements.sql` (19 tests, all pass):**
GetById visibility (author-sees-Scheduled, member-denied-Scheduled, outsider-denied-Published);
Create (Published stamps lifecycle, Scheduled holds, stores chosen author + audit CreatedBy=actor);
Manage list (all statuses + AuthorName + PostedAt); consumer feed (Published-in-audience-only +
AuthorName); Publish (Scheduled→Published now, idempotent, Archived blocked); Retire→Archived;
Update (replaces fields incl. author, Scheduled→Published publishes now, Archived immutable);
Tick (publishes due Scheduled + returns them, leaves future, archives due Published, no-op when idle).

**xUnit — `api/Api.Tests/AnnouncementsControllerTests.cs` (19 tests, all pass):** updated for the new
`CreateAsync`/`UpdateAsync` signatures (`operationId`) and the `AnnouncementDto` shape; added
`Create_ScheduledWithoutDate_Returns400`, `Create_UnknownStatus_Returns400`,
`Create_ChosenAuthorNotMember_Returns400`, `Update_InvalidAuthor_Returns400`.

**Integration — `AnnouncementsEndpointsTests` (6, all pass):** auth-required smoke, unaffected.

### Note — pre-existing repo-wide tSQLt defect (not fixed here, out of scope)
The invalid `EXEC tSQLt.Assert… @Actual = (SELECT …)` / `= CASE …` pattern (a subquery/expression can
never be an EXEC parameter value) appears **206 times** across the repo's tSQLt suites (e.g.
`test_AnnouncementFanout.sql`), so those suites do not compile as written. Only the announcements suite
was corrected (to `DECLARE @v … = (…); … @Actual = @v`). The wider defect is flagged for a dedicated
cleanup slice.
