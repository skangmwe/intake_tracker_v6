# Remediations applied — slice-ai-foundation-b305ed0

## Iteration 1

- **[Phase: 1]** Lazy SDK-client construction in `ClaudeLlmProvider`, `OpenAiLlmProvider`, and `AzureOpenAiEmbeddingService` — client built on first use via `Lazy<T>` with a clear `InvalidOperationException` when the key/endpoint is unconfigured, so DI validation / eager resolve never throws at startup. Added `ConfigureAwait(false)` to the streaming `await foreach` loops. Full Api.Tests suite re-run after the change: 924 passed / 0 failed.
