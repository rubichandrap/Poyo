# 01: The Routes registry is a required deployment artifact

**What to build:** A published application boots and serves every registry route from its
publish directory and from an unrelated working directory, and a deployment whose registry
is missing, empty, unreadable, or unparseable refuses to start with a message that says
which of the four happened. The registry resolves from an explicit configuration value,
then the application installation directory, then a hard failure — never the process
working directory, which in ASP.NET is also the default content root and therefore the
same fragility being removed. The publish configuration copies the registry into the
output. The framework package's own default resolution moves off the working directory too,
so a consumer who passes no explicit path is not silently exposed. The working-directory
derivation is removed from the bootstrap, which also removes the null-forgiving dereference
that threw at a filesystem root. Development tooling points at the project-root registry
explicitly, so this lands without depending on the environment-ownership work.

**Blocked by:** None (can start immediately).

**Status:** done

**Completion:** Done. GitHub issues #76-#81 and #85 are closed. ADRs 0014-0018 record the final contracts, including relative registry overrides.

- [x] A clean `dotnet publish` output boots and serves every registry route, booted from the publish directory and from an unrelated working directory — proven by a new test in the server test project that publishes and boots the output twice, not only by the post-publish fixture end-to-end test.
- [x] A registry that is missing, empty, unreadable, or unparseable each fails startup, and each failure is distinguishable from the other three in its message.
- [x] An empty registry is a startup failure. It is the state that silently disables the access model, so it is never a supported configuration.
- [x] Registry resolution never reads the process working directory — not in the server bootstrap, and not in the framework package's default resolution.
- [x] The published output contains the registry, asserted by the fixture end-to-end test.
- [x] The application starts with the working directory set to the filesystem root and does not throw.
- [x] Development tooling points at the project-root registry explicitly, and a run-from-source launch still works with no environment file present.
- [x] The two existing tests asserting the removed behavior — that a missing registry yields an empty policy, and that an empty registry is accepted — are inverted to assert the failure, and renamed so the suite never contradicts the decision.
- [x] No null-forgiving operator is left on a call that can return null.
- [x] The changelog records the loader's changed contract and the framework package's changed default resolution.

Published as #77.
