# slice-ai-retrieval-d42ab2a — tests added/extended

## Iteration 1
Authored in-slice (per plan Slice 2), not gap-filled here:
- xUnit: CosineTests (5), RecordRetrieverTests (4), EmbeddingRefreshEvaluatorTests (5).
- tSQLt (CI): test_RecordEmbedding.sql (5 — GetRecordsNeedingEmbedding unembedded/unchanged/changed/soft-deleted + Upsert insert-then-update), test_GetRetrievalCandidates.sql (6 — NonMemberGetsZeroRows [permission invariant], member-visible-with-vector, unembedded, closed, soft-deleted).
Store (RecordEmbeddingStore) DB behaviour covered by tSQLt on its procs (TriggerGateway precedent — no unit-mockable seam).
