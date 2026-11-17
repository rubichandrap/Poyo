# @rubichandrap/create-poyo-app

Scaffold a new Poyo project from the template package. The generated project is a complete React + .NET MPA starter with a routes registry and the `poyo` project CLI wired in as a dev dependency.

## Usage

```bash
npx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm dlx @rubichandrap/create-poyo-app@latest MyApp
# or: pnpm create @rubichandrap/poyo-app@latest MyApp

cd MyApp
pnpm run restore     # install JS dependencies and restore .NET packages
pnpm run generate    # generate TypeScript DTOs + Zod schemas from offline OpenAPI snapshot
pnpm run dev         # start the .NET watch server (full-stack MPA; alias for server:watch)
```

### Project names

A name is accepted only when it can be all three things it becomes:

- a C# namespace segment (`<Name>.Server`, `<Name>.Server.Controllers`),
- an npm package name (`<name>.client`),
- one directory name under the current directory.

The grammar is `^[A-Za-z][A-Za-z0-9_]{0,63}$`: start with an ASCII letter, then letters, digits or underscores, at most 64 characters. `my-app`, `1App`, `app.name`, `app name` and `..` are refused before any file is written, and the message names the rule that refused it.

Two more refusals sit on top of the grammar:

- A name the generated server uses as a C# name, such as `Task`, `Path`, `Environment` or `Exception`. The project name becomes the root namespace, and C# finds a namespace before an imported type, so `Task` would turn every `Task` in the server into a reference to the namespace and the project would not compile. The list is derived from the C# the project ships, so it also covers a few ordinary words that appear there (`Dashboard`, `Login`); `MyDashboard` or `DashboardApp` work.
- A Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM0`–`COM9`, `LPT0`–`LPT9`, in any case), which cannot be a directory on Windows.

### Options

| Flag | Description |
|---|---|
| `--project <name>` | Project name (alternative to the positional argument) |
| `--skip-install` | Skip `pnpm install` after scaffolding |

## What you get

- React 19 + TypeScript + Vite client (`<name>.client/`)
- ASP.NET Core MVC server (`<Name>.Server/`) compiling the framework's server core from the installed package
- `routes.json` route registry with access model + SEO metadata
- Dynamic navigation out of the box (`useRouter`, `Link`, typed `routePath`)
- Committed offline OpenAPI snapshot (`openapi/openapi.json`) and gitignored typed route manifest (`routes.generated.ts`)
- Automatic `.env` bootstrapping from `.env.example`
- In-process OpenAPI snapshot export on server boot (development/staging)
- Demo cookie authentication (`demo` / `password`)
- `usePage<T>()` server data injection
- `poyo` CLI installed as a dev dependency (`route:*`, `build`, `generate` scripts)

## License

MIT
