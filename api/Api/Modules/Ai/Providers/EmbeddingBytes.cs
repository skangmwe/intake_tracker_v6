using System.Buffers.Binary;

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

/// <summary>
/// The on-disk form for a stored embedding: a flat little-endian float32 blob (VARBINARY in
/// <c>dbo.RecordEmbedding</c>, Slice 2). Little-endian is fixed regardless of host so a vector
/// written on one machine reads back identically on another.
/// </summary>
public static class EmbeddingBytes
{
    public static byte[] ToBytes(float[] vector)
    {
        var bytes = new byte[vector.Length * sizeof(float)];
        for (var index = 0; index < vector.Length; index++)
        {
            BinaryPrimitives.WriteSingleLittleEndian(
                bytes.AsSpan(index * sizeof(float), sizeof(float)), vector[index]);
        }

        return bytes;
    }

    public static float[] FromBytes(byte[] bytes)
    {
        var count = bytes.Length / sizeof(float);
        var vector = new float[count];
        for (var index = 0; index < count; index++)
        {
            vector[index] = BinaryPrimitives.ReadSingleLittleEndian(
                bytes.AsSpan(index * sizeof(float), sizeof(float)));
        }

        return vector;
    }
}
