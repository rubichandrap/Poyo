# The Routes registry is a required deployment artifact

**Status**: Accepted

The Routes registry is a deployment artifact and a security control, not a content file, and the server treats it as one. The access model, the SEO policy and the private no-store guarantee are all gated on the registry answering for the request, so a deployment that lost it would switch all three off at once and make a `protected` page reachable. An application whose registry is missing, empty, unreadable or unparseable therefore refuses to start, and each of the four states says which one it was.

The registry resolves in a fixed chain: an explicit value (`AddPoyo`'s argument or `Routes:JsonPath`), with a relative value resolved against the content root; then `routes.json` beside the application assembly; then a hard startup failure. The default never consults the process working directory. One qualification, because the claim is otherwise easy to overstate: an explicitly configured *relative* value is resolved against the content root, which the host chooses — and which in ASP.NET defaults to the working directory. So a relative override inherits the working directory by the operator's own instruction, rather than by the framework's choice, which is the distinction this decision is about. The fallback anchor is the application *installation* directory, not the content root, because in ASP.NET the content root defaults to the current working directory — anchoring there would preserve exactly the fragility this decision removes. The server csproj copies the registry beside the assembly, which is what makes the published output self-contained; the source of truth in a generated project stays the single `routes.json` at the project root. Development tooling (`Properties/launchSettings.json`) names the project-root registry explicitly, so a run-from-source launch does not depend on build output being current.

## Considered Options

- Falling back to the content root, or to the working directory as before, was rejected because both make a deployment's access model depend on the directory its host happened to start it in. A container that runs from `/` was the case that proved it: the working directory derivation dereferenced a null parent there and threw before any configuration was read.
- Warning and continuing on an unusable registry was rejected because an empty route policy is not a degraded mode. It is a reachable state with the access model off, and in a container or under a service manager a warning is invisible until a user finds the broken state.
- Reading the registry on first request instead of at boot was rejected for the same reason: the failure would surface as a 404 or an unprotected page rather than as a failed deploy.
- Accepting `[]` as a valid registry was rejected explicitly. A registry with no routes is indistinguishable, once loaded, from a registry that was never read, so it cannot be a supported configuration.
- Reading the development environment file from a parent of the working directory, as the bootstrap used to, was rejected with the rest of that derivation: a null-forgiving dereference on a call that returns null at a filesystem root made one legal working directory crash before configuration was read. The environment file is now named by the launcher and is optional.

## Consequences

`RoutePolicy.Load` is public API in the framework package and its contract changed: a missing file and an empty registry now throw `RoutePolicyException` where they previously returned an empty policy. A consumer that called the loader directly, or that relied on booting without a registry, must ship one. The framework package's default resolution also changed, so a consumer that passed no explicit path no longer follows the working directory.

The registry gains a second copy — build output beside the assembly — which is a copy nobody edits. Editing the project-root file is the only way to change routes; a hand-edit of the published copy is overwritten by the next publish. A deployment that stores its registry somewhere central still can, by setting `Routes:JsonPath` to an absolute path, and a relative value is resolved against the content root so a launcher can name it relative to the application.

Run-from-source launches now get their development values from the launch profile, and the environment file is a convenience that overrides them when present rather than a requirement. Ownership of the process environment itself — which value wins, and when the file is read at all — is a separate decision that follows this one.
