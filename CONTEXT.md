# Poyo

A minimal React + .NET MPA starter framework. Distributed as a monorepo of tooling packages that generate and maintain standalone Poyo projects.

## Language

**Scaffolder**:
The tool (`create-poyo-app`) that creates a new Poyo project from the template.
_Avoid_: CLI, generator, create tool

**Template**:
The clean project skeleton (React client, .NET server, routes registry) with zero tooling. Developed live as a workspace package, copied wholesale into generated projects.
_Avoid_: starter, boilerplate, template files

**Project CLI**:
The `poyo` package of dev tooling installed into generated projects — route management, build glue, and OpenAPI-to-TypeScript codegen. The analogue of `next` in a Next.js project.
_Avoid_: CLI tool, devtool, poyo binary

**Route manager**:
The part of the project CLI that mutates the routes registry and scaffolds the page, view, and controller files for a route.
_Avoid_: route generator, route script

**Generated project**:
A standalone project produced by the scaffolder: the template plus the project CLI as a dev dependency.
_Avoid_: consumer, target app, scaffolded app

**Routes registry**:
The `routes.json` file that maps URL paths to their React page and server view files. The single source of truth for route existence.
_Avoid_: route table, route config
