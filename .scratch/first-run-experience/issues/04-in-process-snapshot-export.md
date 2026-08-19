# 04 — In-process OpenAPI snapshot export on server boot

**What to build:** Running the .NET server reliably refreshes the committed OpenAPI snapshot without loopback network requests or circular deadlocks. The server serializes its own OpenAPI document in-process at startup (Development/Staging) using `IOpenApiDocumentProvider` and `OpenApiJsonWriter` (UTF-8 without BOM) directly to `<client>/openapi/openapi.json`.

**Blocked by:** None — can proceed in parallel.

**Status:** open

- [ ] Create `OpenApiSnapshotExportHostedService` in `Poyo.Server/Hosting/`
- [ ] Export OpenAPI document in-process via `IOpenApiDocumentProvider` and `OpenApiJsonWriter` (no BOM, formatted JSON)
- [ ] Register hosted service in `Program.cs` for Development and Staging environments
- [ ] Support `OPENAPI_EXPORT_PATH` override and `OpenApi:ExportSnapshot=false` configuration opt-out
- [ ] Server boot writes a valid OpenAPI document to the snapshot location without HTTP requests
