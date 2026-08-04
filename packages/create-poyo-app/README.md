# @rubichandrap/create-poyo-app

Scaffold a new Poyo project from the template package. The generated project is a complete React + .NET MPA starter with a routes registry and the `poyo` project CLI wired in as a dev dependency.

## Usage

```bash
npx @rubichandrap/create-poyo-app MyApp
cd MyApp
pnpm run restore     # install JS dependencies and restore .NET packages
pnpm run dev:watch   # start the .NET watch server
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
- Demo cookie authentication (`demo` / `password`)
- `usePage<T>()` server data injection
- `poyo` CLI installed as a dev dependency (`route:*`, `build`, `generate` scripts)

## License

MIT
