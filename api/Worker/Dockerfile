# Multi-stage Dockerfile for the Worker. Base images per api-containers.md.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Worker/Worker.csproj Worker/
RUN dotnet restore Worker/Worker.csproj

COPY Worker/ Worker/
RUN dotnet publish Worker/Worker.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

USER app

ENTRYPOINT ["dotnet", "McDermott.AiTracker.Worker.dll"]
