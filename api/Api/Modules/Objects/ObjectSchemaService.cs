// Objects schema service (Slice — Objects tab, S30). Owns the workspace's object types: the five
// built-in objects (composed here as constants with live Records/Fields counts) plus admin-created
// custom objects (stored in dbo.ObjectDefinition, read/written via stored procedures per
// api-data-access.md). Access is gated at the controller (Viewer+ for reads, WorkspaceAdmin for
// writes); the service trusts the controller has already gated the call.
//
// Built-in objects are constants — not table rows — so there is no per-workspace seeding. Their
// Records count is the live backing-table count and Fields count is the live FieldDefinition count
// (Attachment and Toolkit item have no field schema → 0). Built-ins are read-only: they are never
// created/updated/deleted through this service.

using System.Data;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Objects;

public enum ObjectMutationOutcome
{
    Success,
    NotFound,
    InvalidState,   // 409 — duplicate object name.
}

public sealed record ObjectMutationResult(
    ObjectMutationOutcome Outcome,
    ObjectDefinitionDto? Object,
    string? Detail);

public interface IObjectSchemaService
{
    Task<IReadOnlyList<ObjectDefinitionDto>> ListAsync(Guid workspaceId, CancellationToken cancellationToken);

    Task<ObjectDefinitionDto?> GetByIdAsync(Guid objectId, Guid workspaceId, CancellationToken cancellationToken);
    Task<ObjectMutationResult> CreateAsync(
        Guid workspaceId, ObjectDefinitionCreateRequest request, Guid actorUserId, CancellationToken cancellationToken);
    Task<ObjectMutationResult> UpdateAsync(
        Guid objectId, Guid workspaceId, ObjectDefinitionPatchRequest request, Guid actorUserId, CancellationToken cancellationToken);
    Task<ObjectMutationResult> DeleteAsync(
        Guid objectId, Guid workspaceId, Guid actorUserId, CancellationToken cancellationToken);

    // ---- Global (platform-owned) custom objects (SP3b) — platform-admin surface, no workspace scope ----

    /// <summary>Every Global object type for the platform Objects tab (SP3b): the Global built-ins
    /// (Request, Task) followed by Global custom objects. No workspace scope and no counts — a Global
    /// object's records live per-workspace, not on this reference surface.</summary>
    Task<IReadOnlyList<ObjectDefinitionDto>> ListGlobalAsync(CancellationToken cancellationToken);

    /// <summary>Creates a Global custom object (Location forced to 'Global', no owning workspace). The
    /// request's Location is ignored.</summary>
    Task<ObjectMutationResult> CreateGlobalAsync(
        ObjectDefinitionCreateRequest request, Guid actorUserId, CancellationToken cancellationToken);

    /// <summary>Patches a Global custom object. A built-in or a local custom object id returns NotFound.</summary>
    Task<ObjectMutationResult> UpdateGlobalAsync(
        Guid objectId, ObjectDefinitionPatchRequest request, Guid actorUserId, CancellationToken cancellationToken);

    /// <summary>Soft-deletes a Global custom object. A built-in or a local custom object id returns NotFound.</summary>
    Task<ObjectMutationResult> DeleteGlobalAsync(
        Guid objectId, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class ObjectSchemaService : IObjectSchemaService
{
    // Error numbers from usp_Upsert/DeleteObjectDefinition (see the proc headers).
    private const int ErrNotFound  = 50080;
    private const int ErrDuplicate = 50081;

    // Location value for a Global (platform-owned) custom object.
    private const string GlobalLocation = "Global";

    // Location value for a workspace-owned custom object. Workspace objects are ALWAYS local — only
    // platform admins author Global objects (via the platform Create/Update path). The workspace
    // Update path forces this so a pre-normalisation mislabelled 'Global' row can never be re-persisted.
    private const string LocalWorkspaceLocation = "LocalWorkspace";

    // The five built-in object types, in display order. Fixed ids so the client has a stable key;
    // built-ins are read-only, so these ids never reach the write procs. ObjectKey is the canonical
    // type key (matches FieldDefinition.ObjectType — note Toolkit item's key is "ToolkitItem"), the
    // built-in analogue of a custom object's slug. Location: Request/Task are Global; the rest are
    // LocalWorkspace (blueprint §Object scope).
    private static readonly SystemObjectSpec[] SystemObjects =
    [
        new(new Guid("b1000000-0000-4000-8000-000000000001"), "Request", "Request", "Requests", "Global",
            "The core intake record — one per AI solution request escalated into the workspace."),
        new(new Guid("b1000000-0000-4000-8000-000000000002"), "Task", "Task", "Tasks", "Global",
            "A unit of delivery work attached to a request, grouped by build phase."),
        new(new Guid("b1000000-0000-4000-8000-000000000003"), "Attachment", "Attachment", "Attachments", "LocalWorkspace",
            "A file linked to a request or task — documents, exports, and evidence."),
        new(new Guid("b1000000-0000-4000-8000-000000000004"), "Feature", "Feature", "Feature catalog", "LocalWorkspace",
            "A reusable capability in the Feature Catalog — shipped solutions other teams can browse and adopt."),
        new(new Guid("b1000000-0000-4000-8000-000000000005"), "ToolkitItem", "Toolkit item", "Toolkit", "LocalWorkspace",
            "A playbook, plugin, or prompt in the Toolkit — building blocks analysts apply to requests."),
    ];

    private readonly AppDbContext _db;

    public ObjectSchemaService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<ObjectDefinitionDto>> ListAsync(
        Guid workspaceId, CancellationToken cancellationToken)
    {
        var countsRow = await _db.Set<ObjectRecordCountsRow>()
            .FromSqlRaw("EXEC dbo.usp_GetObjectRecordCounts @WorkspaceId",
                new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var counts = countsRow.FirstOrDefault() ?? new ObjectRecordCountsRow();

        var customRows = await _db.Set<ObjectDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_ListObjectDefinitions @WorkspaceId",
                new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var customCounts = await _db.Set<CustomObjectCountsRow>()
            .FromSqlRaw("EXEC dbo.usp_GetCustomObjectCounts @WorkspaceId",
                new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Built-ins first (with live counts), then the workspace's own + inherited-Global custom objects
        // (live Fields + Records counts; a Global object surfaces with WorkspaceId = Guid.Empty).
        var result = new List<ObjectDefinitionDto>(BuildSystemObjects(workspaceId, counts));
        result.AddRange(BuildCustomObjects(customRows, customCounts));
        return result;
    }

    public async Task<ObjectDefinitionDto?> GetByIdAsync(
        Guid objectId, Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<ObjectDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_GetObjectDefinitionById @ObjectDefinitionId, @WorkspaceId",
                new SqlParameter("@ObjectDefinitionId", objectId),
                new SqlParameter("@WorkspaceId", workspaceId))
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Counts are 0 here: live counts are a list-surface concern (the Objects tab reads ListAsync).
        // GetByIdAsync backs create/update responses, where the object has no fields/records yet or the
        // tab will re-list.
        return rows.FirstOrDefault() is { } row ? MapCustom(row, fieldsCount: 0, recordsCount: 0) : null;
    }

    public async Task<ObjectMutationResult> CreateAsync(
        Guid workspaceId, ObjectDefinitionCreateRequest request, Guid actorUserId, CancellationToken cancellationToken) =>
        await UpsertAsync(
            null, workspaceId, request.Name, request.PluralLabel, request.Location,
            request.Description, request.ShowInSidebar, request.SidebarCategory,
            actorUserId, cancellationToken).ConfigureAwait(false);

    public async Task<ObjectMutationResult> UpdateAsync(
        Guid objectId, Guid workspaceId, ObjectDefinitionPatchRequest request,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        // Load the existing custom row first so a sparse patch can resend unchanged values (and so a
        // missing / built-in id returns NotFound rather than creating a row).
        var existing = await GetByIdAsync(objectId, workspaceId, cancellationToken).ConfigureAwait(false);
        if (existing is null)
        {
            return new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, "Object definition not found.");
        }

        return await UpsertAsync(
            objectId, workspaceId,
            request.Name ?? existing.Name,
            request.PluralLabel ?? existing.PluralLabel,
            LocalWorkspaceLocation,
            request.Description ?? existing.Description,
            request.ShowInSidebar ?? existing.ShowInSidebar,
            request.SidebarCategory ?? existing.SidebarCategory,
            actorUserId, cancellationToken).ConfigureAwait(false);
    }

    // workspaceId is null for a Global (platform-owned) custom object; the proc scopes those on the
    // Global namespace (Location='Global') instead of a workspace.
    private async Task<ObjectMutationResult> UpsertAsync(
        Guid? objectId, Guid? workspaceId,
        string name, string? pluralLabel, string location, string? description,
        bool showInSidebar, string? sidebarCategory,
        Guid actorUserId, CancellationToken cancellationToken)
    {
        var newIdParam = new SqlParameter("@NewObjectDefinitionId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                @"EXEC dbo.usp_UpsertObjectDefinition
                    @ObjectDefinitionId, @WorkspaceId, @Name, @PluralLabel, @Location, @Description,
                    @ShowInSidebar, @SidebarCategory, @ActorUserId, @NewObjectDefinitionId OUTPUT",
                new object[]
                {
                    new SqlParameter("@ObjectDefinitionId", (object?)objectId ?? DBNull.Value),
                    new SqlParameter("@WorkspaceId", (object?)workspaceId ?? DBNull.Value),
                    new SqlParameter("@Name", name),
                    new SqlParameter("@PluralLabel", (object?)pluralLabel ?? DBNull.Value),
                    new SqlParameter("@Location", location),
                    new SqlParameter("@Description", (object?)description ?? DBNull.Value),
                    new SqlParameter("@ShowInSidebar", showInSidebar),
                    new SqlParameter("@SidebarCategory", (object?)sidebarCategory ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    newIdParam,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ErrNotFound)
        {
            return new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == ErrDuplicate)
        {
            return new ObjectMutationResult(ObjectMutationOutcome.InvalidState, null, ex.Message);
        }

        var newId = (Guid)newIdParam.Value!;
        // Global read-back passes Guid.Empty; the relaxed usp_GetObjectDefinitionById matches the Global
        // row via Location='Global' regardless of the workspace passed.
        var saved = await GetByIdAsync(newId, workspaceId ?? Guid.Empty, cancellationToken).ConfigureAwait(false);
        return new ObjectMutationResult(ObjectMutationOutcome.Success, saved, null);
    }

    public Task<ObjectMutationResult> DeleteAsync(
        Guid objectId, Guid workspaceId, Guid actorUserId, CancellationToken cancellationToken) =>
        DeleteInternalAsync(objectId, workspaceId, actorUserId, cancellationToken);

    // workspaceId is null for a Global (platform-owned) custom object; the proc scopes the delete on
    // the Global namespace (Location='Global') instead of a workspace.
    private async Task<ObjectMutationResult> DeleteInternalAsync(
        Guid objectId, Guid? workspaceId, Guid actorUserId, CancellationToken cancellationToken)
    {
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_DeleteObjectDefinition @ObjectDefinitionId, @WorkspaceId, @ActorUserId",
                new object[]
                {
                    new SqlParameter("@ObjectDefinitionId", objectId),
                    new SqlParameter("@WorkspaceId", (object?)workspaceId ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == ErrNotFound)
        {
            return new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, ex.Message);
        }

        return new ObjectMutationResult(ObjectMutationOutcome.Success, null, null);
    }

    public async Task<IReadOnlyList<ObjectDefinitionDto>> ListGlobalAsync(CancellationToken cancellationToken)
    {
        var customRows = await _db.Set<ObjectDefinitionRow>()
            .FromSqlRaw("EXEC dbo.usp_ListGlobalObjectDefinitions")
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Global built-ins (Request, Task) first, then Global custom objects. No counts on this
        // platform reference surface — a Global object's records live per-workspace, not here.
        var result = new List<ObjectDefinitionDto>(GetGlobalSystemObjects());
        result.AddRange(BuildCustomObjects(customRows, Array.Empty<CustomObjectCountsRow>()));
        return result;
    }

    public Task<ObjectMutationResult> CreateGlobalAsync(
        ObjectDefinitionCreateRequest request, Guid actorUserId, CancellationToken cancellationToken) =>
        // Location is forced to Global (request.Location is ignored); no owning workspace.
        UpsertAsync(
            null, null, request.Name, request.PluralLabel, GlobalLocation,
            request.Description, request.ShowInSidebar, request.SidebarCategory,
            actorUserId, cancellationToken);

    public async Task<ObjectMutationResult> UpdateGlobalAsync(
        Guid objectId, ObjectDefinitionPatchRequest request, Guid actorUserId, CancellationToken cancellationToken)
    {
        // Resolve against the Global namespace (Guid.Empty owns no rows, so only a Global row can match).
        // A built-in or a local custom object id fails the Global-custom guard → NotFound.
        var existing = await GetByIdAsync(objectId, Guid.Empty, cancellationToken).ConfigureAwait(false);
        if (existing is not { IsSystem: false, Location: GlobalLocation })
        {
            return new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, "Global object definition not found.");
        }

        return await UpsertAsync(
            objectId, null,
            request.Name ?? existing.Name,
            request.PluralLabel ?? existing.PluralLabel,
            GlobalLocation,
            request.Description ?? existing.Description,
            request.ShowInSidebar ?? existing.ShowInSidebar,
            request.SidebarCategory ?? existing.SidebarCategory,
            actorUserId, cancellationToken).ConfigureAwait(false);
    }

    public async Task<ObjectMutationResult> DeleteGlobalAsync(
        Guid objectId, Guid actorUserId, CancellationToken cancellationToken)
    {
        var existing = await GetByIdAsync(objectId, Guid.Empty, cancellationToken).ConfigureAwait(false);
        if (existing is not { IsSystem: false, Location: GlobalLocation })
        {
            return new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, "Global object definition not found.");
        }

        return await DeleteInternalAsync(objectId, null, actorUserId, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Composes the Global built-in object DTOs (Request, Task) for the platform Objects tab
    /// (S34) — no workspace scope, no counts (a read-only reference). Pure — no I/O — so it is
    /// unit-testable without a database.</summary>
    public static IReadOnlyList<ObjectDefinitionDto> GetGlobalSystemObjects()
    {
        return SystemObjects
            .Where(spec => spec.Location == "Global")
            .Select(spec => new ObjectDefinitionDto(
                spec.Id,
                Guid.Empty,
                spec.ObjectKey,
                spec.Name,
                spec.PluralLabel,
                spec.Location,
                spec.Description,
                ShowInSidebar: true,
                SidebarCategory: null,
                RecordsCount: 0,
                FieldsCount: 0,
                IsSystem: true))
            .ToList();
    }

    /// <summary>Composes the five built-in object DTOs from a workspace's live counts. Pure — no I/O —
    /// so it is unit-testable without a database.</summary>
    public static IReadOnlyList<ObjectDefinitionDto> BuildSystemObjects(Guid workspaceId, ObjectRecordCountsRow counts)
    {
        return SystemObjects.Select(spec => new ObjectDefinitionDto(
            spec.Id,
            workspaceId,
            spec.ObjectKey,
            spec.Name,
            spec.PluralLabel,
            spec.Location,
            spec.Description,
            ShowInSidebar: true,
            SidebarCategory: null,
            RecordsCount: RecordsFor(spec.Name, counts),
            FieldsCount: FieldsFor(spec.Name, counts),
            IsSystem: true)).ToList();
    }

    private static int RecordsFor(string name, ObjectRecordCountsRow counts) => name switch
    {
        "Request" => counts.RequestRecords,
        "Task" => counts.TaskRecords,
        "Attachment" => counts.AttachmentRecords,
        "Feature" => counts.FeatureRecords,
        "Toolkit item" => counts.ToolkitRecords,
        _ => 0,
    };

    private static int FieldsFor(string name, ObjectRecordCountsRow counts) => name switch
    {
        "Request" => counts.RequestFields,
        "Task" => counts.TaskFields,
        "Feature" => counts.FeatureFields,
        // Attachment and Toolkit item have no field schema (FieldDefinition allows only Request/Task/Feature).
        _ => 0,
    };

    /// <summary>Composes the custom-object DTOs from their rows and the per-object live field/record
    /// counts (usp_GetCustomObjectCounts). Pure — no I/O — so it is unit-testable without a database
    /// (mirrors BuildSystemObjects). An object with no counts row reports 0 for both.</summary>
    public static IReadOnlyList<ObjectDefinitionDto> BuildCustomObjects(
        IReadOnlyList<ObjectDefinitionRow> customRows,
        IReadOnlyList<CustomObjectCountsRow> counts)
    {
        var countsByObject = counts.ToDictionary(row => row.ObjectDefinitionId);
        return customRows.Select(row =>
        {
            countsByObject.TryGetValue(row.ObjectDefinitionId, out var count);
            return MapCustom(row, count?.FieldsCount ?? 0, count?.RecordsCount ?? 0);
        }).ToList();
    }

    // A Global (platform-owned) custom object has no owning workspace (row.WorkspaceId NULL) and
    // surfaces with WorkspaceId = Guid.Empty; a local object carries its own workspace on the row.
    private static ObjectDefinitionDto MapCustom(
        ObjectDefinitionRow row, int fieldsCount, int recordsCount) => new(
        row.ObjectDefinitionId,
        row.WorkspaceId ?? Guid.Empty,
        row.ObjectKey,
        row.Name,
        row.PluralLabel,
        row.Location,
        row.Description,
        row.ShowInSidebar,
        row.SidebarCategory,
        RecordsCount: recordsCount,
        FieldsCount: fieldsCount,
        IsSystem: false);

    private sealed record SystemObjectSpec(Guid Id, string ObjectKey, string Name, string PluralLabel, string Location, string Description);
}
