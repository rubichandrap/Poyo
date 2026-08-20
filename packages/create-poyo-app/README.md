# @rubichandrap/create-poyo-app

Scaffold a new Poyo project from the template package. The generated project is a complete React + .NET MPA starter with a routes registry and the `poyo` project CLI wired in as a dev dependency.

## Usage

```bash
npx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm dlx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm create @rubichandrap/poyo-app@latest MyApp

cd MyApp
pnpm run restore     # install JS dependencies and restore .NET packages
pnpm run generate    # generate TypeScript DTOs and Zod schemas from offline OpenAPI snapshot
pnpm run dev         # start the .NET watch server (full-stack MPA; alias for server:watch)
```

### Options

| Flag | Description |
|---|---|
| `--project <name>` | Project name (alternative to the positional argument) |
| `--skip-install` | Skip `pnpm install` after scaffolding |

## What you get

- React 19 + TypeScript + Vite client (`<name>.client/`)
- ASP.NET Core MVC server (`<Name>.Server/`)
- `routes.json` route registry with access model + SEO metadata
- Committed typed route manifest (`routes.generated.ts`) and offline OpenAPI snapshot (`openapi/openapi.json`)
- Automatic `.env` bootstrapping from `.env.example`
- In-process OpenAPI snapshot export on server boot (development/staging)
- Demo cookie authentication (`demo` / `password`)
- `usePage<T>()` server data injection
- `poyo` CLI installed as a dev dependency (`route:*`, `build`, `generate` scripts)

## License

MIT
