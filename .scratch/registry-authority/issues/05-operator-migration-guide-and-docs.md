# 05: Operator migration guide and deployment documentation

**What to build:** An operator upgrading an existing deployment gets a written procedure,
because this work changes a contract and the failure mode is silence.

The hazard's shape: values in a hand-edited production `.env` are authoritative today
*precisely because* the loader overrides process variables. The moment the file stops being
read in production, every value an operator added by hand reverts — at exactly the moment
they set their environment variable correctly and believe the deployment is tightened. A
green boot is not evidence the migration is complete, and the documentation has to say so.

The procedure: inventory the production `.env` and diff it against `.env.example`. Every
key not in the example moves to the host — connection strings, logging overrides,
allowed-hosts, and especially the registry path override, the one most likely to be present
and the one whose loss is a security regression. Move them in the same change that sets
`ASPNETCORE_ENVIRONMENT=Production`.

Name the supported host mechanisms rather than only prohibiting the old one: a service
manager `EnvironmentFile=`, `docker run --env-file`, IIS `web.config` environmentVariables,
or `appsettings.Production.json`.

Also record the contract changes in the two places a reader looks: the template's deployment
and configuration sections, and the agent-facing architecture guidance. Claims to correct:
the Routes registry is a required deployment artifact and a security control; a route's
identity is canonical on disk; the conventional controller/action URL is no longer served;
an environment file never travels with the artifact.

**Blocked by:** 01 (#77), 02 (#78), 03 (#79), 04 (#80).

**Status:** done

**Completion:** Done. GitHub issues #76-#81 and #85 are closed. ADRs 0014-0018 record the final contracts, including relative registry overrides.

- [x] The upgrade procedure tells an operator to inventory their production `.env` and diff it against the example file before upgrading.
- [x] The procedure names the registry path override specifically as the value most likely to be present and the one whose loss is a security regression.
- [x] The procedure states that a green boot is not evidence the migration is complete, because values revert at the moment the host is configured correctly.
- [x] The procedure lists the supported host mechanisms by name: service manager environment file, container environment file, IIS configuration environment variables, or a production appsettings file.
- [x] The template's deployment and configuration sections describe `.env` as development-only and state it never travels with the artifact.
- [x] The architecture guidance describes the Routes registry as a required deployment artifact and a security control, and states that a missing, empty, unreadable, or unparseable registry fails startup.
- [x] The architecture guidance states that a route's identity is canonical on disk, and lists the declared-path, name, and controller/action rules.
- [x] The architecture guidance records that the conventional controller/action URL for a page route is no longer served.
- [x] Every user-visible contract change from the preceding tickets appears in the changelog, checked for consistency with what actually shipped — the candidate that motivated this work shipped with a changelog entry missing entirely.
- [x] The registry, environment, and hosting claims in the documentation are each checked against shipped behaviour, not against the decision as written.

Published as #81.
