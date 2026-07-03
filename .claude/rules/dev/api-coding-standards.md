# Coding Standards — .NET / Azure

## Runtime / Target Framework

- Target framework: net10.0 for every project in the repo — API, Worker, shared types, all test projects, and all standalone tools under tools/. No per-project drift.
- Container base images: mcr.microsoft.com/dotnet/sdk:10.0 for build stages, mcr.microsoft.com/dotnet/aspnet:10.0 for the API runtime stage, mcr.microsoft.com/dotnet/runtime:10.0 for the Worker runtime stage. Pinned tags per api-containers.md — never latest.
- Local SDK: 10.0.x. A global.json may pin a minor version; check it before installing.
- Bumping the framework version is a coordinated single PR, never incremental: every .csproj <TargetFramework>, every Dockerfile base image, and any global.json move together. Touching one without the others leaves the repo in a mixed state where some assemblies expect APIs the others don't have.

## Naming Conventions

- Controllers: `[Resource]Controller` — PascalCase, plural resource (e.g. `DocumentsController`)
- Services: `I[Name]Service` (interface) + `[Name]Service` (implementation)
- DTOs: `[Name]Request`, `[Name]Response` — never `[Name]Model` or `[Name]DTO`
- Action methods: HTTP-verb conventions — `Get[Resource]`, `Create[Resource]`, `Update[Resource]`, `Delete[Resource]`
- Async methods end in `Async` (`GetDocumentAsync`, not `GetDocument`)
- Private fields: `_camelCase` with underscore prefix
- Constants: `PascalCase` for `public const`; `UPPER_SNAKE_CASE` for environment-variable keys
- Boolean variables and properties: prefix with `Is`, `Has`, `Should`, or `Can`
- Variables must be descriptive and self-documenting — single-letter names are not allowed (including loop counters such as `i`, `j`, `k`; use `index`, `rowIndex`, etc.)

## Project Structure

- Controllers handle request/response only — authentication, validation, routing, returning results. **No business logic, no direct database access, no complex conditionals.**
- Simple synchronous operations belong in internal service classes within the API project — invoked from controllers via DI
- Services depend on abstractions (interfaces), not concrete implementations
- Service-to-service reads: prefer a shared database for read-only lookups over an HTTP call
- Avoid synchronous call chains beyond a single hop — chained HTTP/RPC across services creates latency and failure surface

## Async / Await Discipline

- Every async method must accept and pass a `CancellationToken`
- Applies to controllers, services, and all infrastructure I/O (EF Core, `HttpClient`, and any queue / blob / external service the project uses)
- Pass the token all the way down — never swallow it at a service boundary
- Use `ConfigureAwait(false)` in library code (anything not in the ASP.NET pipeline)
- No fire-and-forget async calls without explicit error handling — `_ = SomethingAsync()` is a bug
- Do not block on async code (`.Result`, `.Wait()`, `GetAwaiter().GetResult()`) — propagate `await` instead

## Control Flow

- Do not use exceptions for expected control flow — use result patterns, boolean returns, or nullable returns instead
- Throw exceptions only for genuinely exceptional conditions — invalid program state, unmet preconditions
- No LINQ with side effects (`.Select()` that mutates state, `.Where()` that calls services) — LINQ expressions must be pure

## Dependency Injection

- Register services in `Program.cs` or a dedicated extension method (e.g. `AddDocumentServices()`)
- Constructor injection only — never `HttpContext.RequestServices` or static service-locator patterns
- Lifetimes:
  - `Scoped` — anything that holds per-request state, including `DbContext`
  - `Singleton` — stateless utilities, configured clients (`IHttpClientFactory`, Azure SDK clients)
  - `Transient` — lightweight stateless helpers
- Never inject `Scoped` services into `Singleton` services — capture by factory or use `IServiceScopeFactory`

## Configuration

- Access configuration via the `IOptions<T>` pattern — bind a strongly-typed class in `Program.cs`, inject `IOptions<T>` into consumers
- Do not inject raw `IConfiguration` into services — that pattern is reserved for `Program.cs` startup code
- Use strongly-typed configuration classes — never read settings by string key inside services
- Environment variable keys are `UPPER_SNAKE_CASE` and namespaced (e.g. `DOCUMENTS_BLOB_CONTAINER`, not `Container`)
- For secrets handling (Key Vault as the only sanctioned store, what counts as a secret vs. non-secret config, forbidden patterns) see `api-secrets.md`

## Response Caching with Azure Front Door

The API sits behind Azure Front Door, which caches responses at the edge by default. Every API response must set explicit `Cache-Control` headers so AFD doesn't serve one user's data to another.

- **Default for any authenticated endpoint:** `Cache-Control: private, no-store`. Set this in middleware so it applies to every response unless explicitly overridden.
- **Public, shared resources** (lookup tables, status enums, non-user-scoped reference data): `Cache-Control: public, max-age=<seconds>` with an appropriate TTL.
- **Never rely on AFD's defaults.** An endpoint returning user-scoped data without an explicit `Cache-Control` header is a data-leak waiting to happen — the next request for the same URL from the same edge POP can receive the cached response.

## JSON Serialization

- API enums must serialize as **string names**, not integer ordinals. This makes the wire format SPA-friendly and stable across enum reorders. Configure once in `Program.cs`:
  ```csharp
  builder.Services.AddControllers()
      .AddJsonOptions(opts =>
          opts.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
  ```
  Both directions (read and write) become string-binding.
- Integration-test deserialization must mirror the API's serialization options — provide a shared `TestJsonOptions.ReadAsAsync<T>(this HttpResponseMessage)` helper that constructs a `JsonSerializerOptions` with `JsonStringEnumConverter` registered, so test assertions on response bodies do not silently coerce string-enum responses.

## NuGet Package Pins

Some Azure SDK overloads only land in newer transitive-package versions. The compiler error in these cases is misleading — e.g. `"no overload for FromBytes takes 2 arguments"` despite the top-level Azure SDK package being current — because an older transitive version pins down a previous overload set.

- **`System.Memory.Data` 8.0.0 or later** — required when constructing `BinaryData` from bytes for an Azure SDK call that takes a media type. `BinaryData.FromBytes(ReadOnlyMemory<byte>, string mediaType)` and the matching 2-arg constructor land in 6.0+, but several Azure transitive deps still pin 1.x. Reference `System.Memory.Data` explicitly at 8.0.0 in any project that constructs `BinaryData` for Azure Document Intelligence, OpenAI, or similar SDK calls — without it the body's media type silently falls back to `application/octet-stream`.

General rule: if an Azure SDK overload appears to be missing despite the top-level package being current, check the transitive dep that owns the type and add an explicit reference to bump it. This is a one-line fix; the cost of debugging it from the misleading compile error is hours.

## Globalization

- **Do not set `<InvariantGlobalization>true</InvariantGlobalization>`** in `App.csproj` or any project that depends on `Microsoft.Data.SqlClient`. SQL Server's client performs LCID-to-culture mapping during connection setup; invariant globalization mode disables ICU, causing that lookup to throw a `CultureNotFoundException` and preventing the application from opening any database connection at runtime.
- Omit the property entirely (the default is `false`). If a future dependency explicitly requires invariant mode, escalate — the two cannot coexist with SQL Server.
- This failure is invisible to the integration test suite even though those tests run against real SQL Server (LocalDB / Testcontainers per `api-testing-guidelines.md` — never in-memory or SQLite). `InvariantGlobalization` is a process-wide runtime setting baked into the *app's* `runtimeconfig.json`, and `WebApplicationFactory<Program>` hosts the app inside the test runner's process, which does not apply `App.csproj`'s globalization setting. So `Microsoft.Data.SqlClient` loads and opens LocalDB connections normally under test; the flag only takes effect when the app runs as its own published process — the only place the `CultureNotFoundException` surfaces.

## Swagger / API Documentation

- Swagger UI is gated by a `Swagger:Enabled` configuration flag, **not** `IsDevelopment()`. Reasoning: flipping `ASPNETCORE_ENVIRONMENT=Development` also turns on the developer exception page, which violates the "never expose stack traces" rule in `api-error-handling.md`. The flag separates the two concerns.
- Default `Swagger:Enabled = false` in production environments. Enable explicitly per-deployment when documentation or smoke testing requires the UI.
- For Swagger schema population, the API project's `.csproj` must include:
  ```xml
  <PropertyGroup>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <NoWarn>$(NoWarn);1591</NoWarn>
  </PropertyGroup>
  ```
  This emits XML documentation for Swashbuckle to consume, and silences the "missing XML comment" warning so XML comments can be added progressively without breaking the build.
- When Swagger is exposed, the default strict CSP must be relaxed on `/swagger/*` paths only — see `api-performance.md` (Security Headers).
