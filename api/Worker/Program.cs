// AI Solutions Tracker — Worker Service entrypoint.
//
// Scaffold state: registers no processors. Slice 12 (Notifications) and slice 16
// (CSV Import & Export) add Service Bus processors that ride on the shared event
// spine (api-worker.md).

using McDermott.AiTracker.Worker;

var builder = Host.CreateApplicationBuilder(args);

// Placeholder registration — replaced by real Service Bus processors in later slices.
builder.Services.AddHostedService<ScaffoldNoopService>();

var host = builder.Build();
await host.RunAsync();
