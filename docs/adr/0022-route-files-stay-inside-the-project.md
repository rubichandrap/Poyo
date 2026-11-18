# A route's file paths stay inside the project

**Status**: Accepted. Amends ADR 0015 and ADR 0018 where they said the server judges no file path's value: it still judges no file path's *blankness*, but containment is now a rule both runtimes enforce.

A route's `files.react` and `files.view` are relative paths the route manager resolves against the project to scaffold and delete files. Nothing said they had to stay there. A hand-edited `"react": "../../victim.txt"` passed both validators, and `route remove --yes` then deleted a file outside the project — the command resolved the declared path against the client directory and unlinked whatever it named. The registry is authored, and the route manager acts on it with filesystem writes and deletes; a path that leaves the project is a file operation the project never asked for.

The declared path is now **contained**: a `..` segment, an absolute path or a drive-rooted path is refused, by the server at boot and by the route manager on every read and write. The three are told apart because they leave the project for different reasons — an absolute path replaces the directory it is resolved against, a drive-rooted path names a volume instead of a directory, and a `..` segment walks out of the directory — and each earns its own sentence naming the field and the value. A `..` spelled with either separator counts, because a registry is authored once and deployed anywhere. "Drive-rooted" includes a bare drive prefix (`C:`), which is drive-relative on Windows and still not a project path.

The route manager also checks **at the operation**, not only at the read: `scaffoldRouteFiles` resolves and checks both files before writing either, `deleteRouteFiles` resolves and checks the files and the controller before unlinking any of them, and `route sync` uses the same resolution for the views it creates and the files it deletes. A command that is handed a route the registry validator never saw still cannot write or delete outside the project. That matters because the registry is a file on disk between the read and the operation, and because a rule enforced only where the file is read is a rule the next caller can skip.

The server's half is deliberately syntactic: it knows the registry path, not the client and server directories a generated project uses, and it never resolves a file path itself. A path that is absolute, drive-rooted or holds a `..` segment cannot be a project-relative path whatever the layout is, so the server refuses the form rather than resolving it.

Two boundaries do not move. A **blank** file path is still not part of a route's identity: the route manager refuses an absent or empty one because it resolves the path, and the server serves a whitespace-only one (ADR 0015, ADR 0018). And a file path is still not judged for anything but containment — a path under `src/pages` or `Views` that does not exist, or one a project resolves without the framework's help, is not the registry's business.

## Considered Options

- **Guarding only the registry readers was rejected.** It closes the reproduced case, where the CLI reads the registry first, but it makes the safety of a delete depend on which function the caller used. The operation is the thing that touches the filesystem, so the operation checks.
- **Guarding only the operations was rejected.** A deployment with a hand-edited registry would boot and serve until a visitor reached a route whose view is missing, and the operator would learn about an authored mistake at runtime. ADR 0014's rule is that an authored registry error fails the boot; this is one.
- **Resolving the paths on the server and comparing them to the project root was rejected.** The server does not own the client directory, and a published application's project layout is not the deployment's layout. The declared form is the contract both runtimes can judge without inventing a root.
- **Restricting files to `src/pages` and `Views` was rejected** as a second rule with no defect behind it: a flat layout, a custom directory and a hand-arranged project are all legitimate as long as the file stays inside the project.
- **Refusing only `..` was rejected.** `<root>/../../victim` and `C:/Windows/...` both leave the project without a dot segment, and `path.resolve` answers the absolute path while silently discarding the root it was given.

## Consequences

A registry that booted with an absolute, drive-rooted or dot-segment file path now fails to start, and the route manager refuses it when it is authored. The messages name the route, the field and the value, so the fix is an edit; a generated project's registry is already canonical, so no migration step is needed. Six corpus cases pin the rule — one per violation per field — and both suites read them, so a runtime that refuses a form the other accepts turns the corpus red.

`RouteFilePaths` is new internal surface in the framework package's server core, called by `RoutePolicy` before a route's identity is checked. The route manager's half is `src/file-paths.ts`: `filePathRefusal` and its clause are the reader's wording, and `containedProjectPath` / `routeFilePaths` are the operation's guard, so the registry and the filesystem act on one definition.
