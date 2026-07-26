using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>
/// Proc-gateway for Ask conversations (api-data-access.md — procs, not EF LINQ CRUD; every dynamic value is a
/// SqlParameter). Ownership is enforced in SQL: the read/write procs THROW (52001–52003) when the caller does not
/// own the target, and this store maps those to <see cref="KeyNotFoundException"/> so the controller returns 404
/// (non-disclosure) rather than leaking that a foreign conversation exists.
/// </summary>
public sealed class AiConversationStore : IAiConversationStore
{
    // Custom SQL error numbers raised by the ownership gates in the conversation procs.
    private const int OwnershipViolationErrorMin = 52001;
    private const int OwnershipViolationErrorMax = 52003;

    private readonly AppDbContext _db;

    public AiConversationStore(AppDbContext db)
    {
        _db = db;
    }

    public async Task<Guid> CreateAsync(
        Guid workspaceId, Guid userId, string? title, CancellationToken cancellationToken)
    {
        var actor = userId.ToString();
        var rows = await _db.Set<AiConversationIdRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_CreateAiConversation @WorkspaceId, @UserId, @Title, @By",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Title", (object?)title ?? DBNull.Value),
                new SqlParameter("@By", actor))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows[0].ConversationId;
    }

    public async Task<Guid> AppendAsync(
        Guid conversationId, Guid userId, string role, string content, string? citationsJson, CancellationToken cancellationToken)
    {
        var actor = userId.ToString();
        try
        {
            var rows = await _db.Set<AiMessageIdRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_AppendAiMessage @ConversationId, @UserId, @Role, @Content, @CitationsJson, @By",
                    new SqlParameter("@ConversationId", conversationId),
                    new SqlParameter("@UserId", userId),
                    new SqlParameter("@Role", role),
                    new SqlParameter("@Content", content),
                    new SqlParameter("@CitationsJson", (object?)citationsJson ?? DBNull.Value),
                    new SqlParameter("@By", actor))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            return rows[0].MessageId;
        }
        catch (SqlException ex) when (IsOwnershipViolation(ex))
        {
            throw new KeyNotFoundException("Conversation not found.");
        }
    }

    public async Task<IReadOnlyList<AiMessage>> LoadAsync(
        Guid conversationId, Guid userId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<AiMessageRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_GetAiConversation @ConversationId, @UserId",
                    new SqlParameter("@ConversationId", conversationId),
                    new SqlParameter("@UserId", userId))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            return rows
                .Select(row => new AiMessage(
                    row.MessageId, row.Role, row.Content, row.CitationsJson, row.Feedback, row.CreatedAt))
                .ToList();
        }
        catch (SqlException ex) when (IsOwnershipViolation(ex))
        {
            throw new KeyNotFoundException("Conversation not found.");
        }
    }

    public async Task<(IReadOnlyList<AiConversationSummary> Items, int TotalCount)> ListAsync(
        Guid workspaceId, Guid userId, int page, int pageSize, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<AiConversationListRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetAiConversationsForUser @WorkspaceId, @UserId, @Page, @PageSize",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Page", page),
                new SqlParameter("@PageSize", pageSize))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var totalCount = rows.Count > 0 ? rows[0].TotalCount : 0;
        var items = rows
            .Select(row => new AiConversationSummary(row.ConversationId, row.Title, row.CreatedAt, row.UpdatedAt))
            .ToList();

        return (items, totalCount);
    }

    public async Task SetFeedbackAsync(
        Guid messageId, Guid userId, string feedback, CancellationToken cancellationToken)
    {
        var actor = userId.ToString();
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_SetAiMessageFeedback @MessageId, @UserId, @Feedback, @By",
                new[]
                {
                    new SqlParameter("@MessageId", messageId),
                    new SqlParameter("@UserId", userId),
                    new SqlParameter("@Feedback", feedback),
                    new SqlParameter("@By", actor),
                },
                cancellationToken)
                .ConfigureAwait(false);
        }
        catch (SqlException ex) when (IsOwnershipViolation(ex))
        {
            throw new KeyNotFoundException("Message not found.");
        }
    }

    private static bool IsOwnershipViolation(SqlException ex) =>
        ex.Number is >= OwnershipViolationErrorMin and <= OwnershipViolationErrorMax;
}
