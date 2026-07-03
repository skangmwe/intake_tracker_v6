// Service Bus publisher — thin wrapper over the Azure SDK, authenticated with
// Managed Identity via DefaultAzureCredential (api-worker.md, api-secrets.md). The
// SDK provides retry/throttling with Retry-After honouring, so no extra retry logic
// is added here (api-performance.md — outbound throttling).
//
// Carries OperationId + W3C trace context on every message so the API -> Worker
// correlation is preserved (api-logging.md). Never forwards internal correlation IDs
// to third parties — the topic is internal-only.
//
// No-op mode: when ServiceBusOptions.Namespace is empty the publisher does not create
// a client, so local/dev runs (and the health probe) work without Service Bus — the
// same "no-op when config unset" pattern the AFD-lockdown middleware uses.

using System.Diagnostics;
using Azure.Identity;
using Azure.Messaging.ServiceBus;
using McDermott.AiTracker.Api.Shared.EventSpine;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Shared.Messaging;

public sealed class ServiceBusPublisher : IServiceBusPublisher, IAsyncDisposable
{
    private readonly ILogger<ServiceBusPublisher> _logger;
    private readonly bool _enabled;
    private readonly ServiceBusClient? _client;
    private readonly ServiceBusSender? _sender;

    public ServiceBusPublisher(IOptions<ServiceBusOptions> options, ILogger<ServiceBusPublisher> logger)
    {
        _logger = logger;
        var settings = options.Value;

        if (string.IsNullOrWhiteSpace(settings.Namespace))
        {
            _enabled = false;
            _logger.LogInformation("Service Bus namespace not configured — event-spine publishing runs in no-op mode.");
            return;
        }

        _enabled = true;
        _client = new ServiceBusClient(settings.Namespace, new DefaultAzureCredential());
        _sender = _client.CreateSender(settings.TopicName);
    }

    public async Task PublishAsync(EventEnvelope envelope, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        ct.ThrowIfCancellationRequested();

        if (!_enabled || _sender is null)
        {
            return;
        }

        var message = new ServiceBusMessage(envelope.PayloadJson)
        {
            MessageId = envelope.EventId.ToString(),
            Subject = envelope.EventType,
            ContentType = "application/json",
        };

        message.ApplicationProperties["event_type"] = envelope.EventType;
        message.ApplicationProperties["workspace_id"] = envelope.WorkspaceId.ToString();
        message.ApplicationProperties["operation_id"] = envelope.OperationId;
        if (envelope.RecordId is not null)
        {
            message.ApplicationProperties["record_id"] = envelope.RecordId;
        }
        if (envelope.ActorUserId is Guid actor)
        {
            message.ApplicationProperties["actor_user_id"] = actor.ToString();
        }
        if (Activity.Current?.Id is string traceParent)
        {
            message.ApplicationProperties["traceparent"] = traceParent;
        }
        if (Activity.Current?.TraceStateString is string traceState)
        {
            message.ApplicationProperties["tracestate"] = traceState;
        }

        await _sender.SendMessageAsync(message, ct).ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        if (_sender is not null)
        {
            await _sender.DisposeAsync().ConfigureAwait(false);
        }
        if (_client is not null)
        {
            await _client.DisposeAsync().ConfigureAwait(false);
        }
    }
}
