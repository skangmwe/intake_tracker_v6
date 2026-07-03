// Soft-delete global query filter (shared-inventory.md 'soft-delete-filter').
// Applies `WHERE IsDeleted = 0` to every entity implementing ISoftDeletable so
// soft-deleted rows are excluded from all queries by default (database-coding-standards.md).

using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Data;

public static class GlobalFilters
{
    /// <summary>Adds a soft-delete query filter to every ISoftDeletable entity in the model.</summary>
    public static void ApplySoftDeleteFilter(this ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (!typeof(ISoftDeletable).IsAssignableFrom(entityType.ClrType))
            {
                continue;
            }

            // e => !e.IsDeleted
            var parameter = Expression.Parameter(entityType.ClrType, "e");
            var isDeleted = Expression.Property(parameter, nameof(ISoftDeletable.IsDeleted));
            var filter = Expression.Lambda(Expression.Not(isDeleted), parameter);

            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(filter);
        }
    }
}
