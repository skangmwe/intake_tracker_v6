namespace McDermott.AiTracker.Api.Modules.Ai.Retrieval;

/// <summary>
/// Cosine similarity between two embedding vectors — the semantic-relevance measure the retriever ranks on.
/// Returns a value in [-1, 1] (1 = same direction, 0 = orthogonal, -1 = opposite). A zero-norm vector (or a
/// dimension mismatch, which can only be a bug) yields 0 rather than a NaN/exception, so a bad row can never
/// poison the ranking.
/// </summary>
public static class Cosine
{
    public static double Similarity(float[] left, float[] right)
    {
        if (left.Length == 0 || left.Length != right.Length)
        {
            return 0d;
        }

        double dot = 0d;
        double leftNormSquared = 0d;
        double rightNormSquared = 0d;

        for (var index = 0; index < left.Length; index++)
        {
            double leftValue = left[index];
            double rightValue = right[index];
            dot += leftValue * rightValue;
            leftNormSquared += leftValue * leftValue;
            rightNormSquared += rightValue * rightValue;
        }

        if (leftNormSquared == 0d || rightNormSquared == 0d)
        {
            return 0d;
        }

        return dot / (Math.Sqrt(leftNormSquared) * Math.Sqrt(rightNormSquared));
    }
}
