using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

/// <summary>
/// Indexes the registered <see cref="ILlmProvider"/>s by name and routes to the requested one,
/// falling back to the configured default when the name is null, blank, or unregistered.
/// </summary>
public sealed class LlmProviderFactory : ILlmProviderFactory
{
    private readonly IReadOnlyDictionary<string, ILlmProvider> _providers;
    private readonly string _defaultProvider;

    public LlmProviderFactory(IEnumerable<ILlmProvider> providers, IOptions<AiOptions> options)
    {
        _providers = providers.ToDictionary(provider => provider.Name, StringComparer.OrdinalIgnoreCase);
        _defaultProvider = options.Value.DefaultProvider;
    }

    public ILlmProvider Get(string? providerName)
    {
        var name = string.IsNullOrWhiteSpace(providerName) ? _defaultProvider : providerName;

        if (_providers.TryGetValue(name, out var provider))
        {
            return provider;
        }

        // Unknown provider → the configured default. If even the default isn't registered,
        // that's a misconfiguration, not a request error — fail loudly.
        if (_providers.TryGetValue(_defaultProvider, out var fallback))
        {
            return fallback;
        }

        throw new InvalidOperationException(
            $"No LLM provider registered for '{name}' or the default '{_defaultProvider}'.");
    }
}
